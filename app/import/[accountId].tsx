import { useCallback, useMemo, useState } from 'react';
import { View, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Text } from '@/src/components/text';
import { TestIDs } from '@/e2e/support/test-ids';
import { useStore } from '@/src/store';
import { detectColumns } from '@/src/utils/bank-import/detect-columns';
import { reconcile } from '@/src/utils/bank-import/reconcile';
import { parseBankRows } from '@/src/utils/bank-import/parse-rows';
import { buildImportTransactions } from '@/src/utils/bank-import/build-transactions';
import { validateTransaction } from '@/src/utils/transaction-validation';
import { generateId } from '@/src/utils/ids';
import { DEFAULT_ICONS } from '@/src/constants/icons';
import type { ColumnMapping, DetectionResult, ReconciledRow } from '@/src/utils/bank-import/types';
import type { Entity } from '@/src/types';
import { StepMapColumns } from '@/src/components/bank-import/step-map-columns';
import { StepReview } from '@/src/components/bank-import/step-review';

export default function ImportScreen() {
	const { accountId } = useLocalSearchParams<{ accountId: string }>();
	const router = useRouter();
	const entities = useStore((s) => s.entities);
	const transactions = useStore((s) => s.transactions);
	const createTransactionBatch = useStore((s) => s.createTransactionBatch);
	const addEntity = useStore((s) => s.addEntity);
	const account = useMemo(() => entities.find((e) => e.id === accountId), [entities, accountId]);

	const [rawText, setRawText] = useState<string | null>(null);
	const [mapping, setMapping] = useState<ColumnMapping | null>(null);
	const [headers, setHeaders] = useState<string[]>([]);
	const [confident, setConfident] = useState<DetectionResult['confident']>({
		date: true,
		amount: true,
	});
	const [step, setStep] = useState<'pick' | 'map' | 'review'>('pick');
	const [busy, setBusy] = useState(false);
	const [reconciled, setReconciled] = useState<ReconciledRow[]>([]);
	const [committing, setCommitting] = useState(false);

	const handlePick = useCallback(async () => {
		try {
			setBusy(true);
			const result = await DocumentPicker.getDocumentAsync({
				type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
				copyToCacheDirectory: true,
			});
			if (result.canceled || !result.assets?.[0]) return;
			const content = await new File(result.assets[0].uri).text();
			const detected = detectColumns(content);
			if (!detected) {
				Alert.alert('Import', 'No data rows found in that file.');
				return;
			}
			setRawText(content);
			setMapping(detected.mapping);
			setHeaders(detected.headers);
			setConfident(detected.confident);
			setStep('map');
		} catch (e) {
			console.error('Import file pick failed', e);
			Alert.alert('Import', 'Could not read the selected file.');
		} finally {
			setBusy(false);
		}
	}, []);

	// When entering review, parse with the final mapping and reconcile against
	// this account's existing transactions to flag likely-duplicate rows.
	const enterReview = useCallback(() => {
		if (!rawText || !mapping || !account) return;
		const { rows } = parseBankRows(rawText, mapping);
		const acctTxns = transactions.filter(
			(t) => t.from_entity_id === account.id || t.to_entity_id === account.id
		);
		const reconciledRows = reconcile(rows, acctTxns, account.id);

		// Light transfer auto-suggestion: if a "new" row's description contains
		// another active account's name, pre-select that account as the
		// transfer counterparty (still requires user confirmation via the
		// normal picker before commit). Only consider same-currency accounts —
		// a cross-currency transfer fails commit-time validation and would
		// silently sabotage the pre-fill it's meant to help with. Accounts with
		// a blank/whitespace name are skipped so they can't match everything.
		const otherAccounts = entities.filter(
			(e) =>
				e.type === 'account' &&
				e.is_deleted !== true &&
				e.id !== account.id &&
				e.currency === account.currency &&
				e.name.trim().length > 0
		);
		const withSuggestions = reconciledRows.map((row): ReconciledRow => {
			if (row.status !== 'new') return row;
			const description = row.parsed.description.toLowerCase();
			let best: Entity | null = null;
			for (const candidate of otherAccounts) {
				const name = candidate.name.trim();
				if (!description.includes(name.toLowerCase())) continue;
				if (!best || name.length > best.name.trim().length) best = candidate;
			}
			if (!best) return row;
			return {
				...row,
				suggestedTransferAccountId: best.id,
				assignment: { kind: 'transfer', accountId: best.id },
			};
		});

		setReconciled(withSuggestions);
		setStep('review');
	}, [rawText, mapping, account, transactions, entities]);

	const activeOfType = useCallback(
		(type: Entity['type']) =>
			entities.filter(
				(e) => e.type === type && e.is_deleted !== true && e.currency === account?.currency
			),
		[entities, account]
	);

	const makeCategory = useCallback(
		(name: string): Entity => ({
			id: generateId(),
			type: 'category',
			name,
			currency: account?.currency ?? 'EUR',
			icon: DEFAULT_ICONS.category,
			row: 0,
			position: 0,
		}),
		[account]
	);

	const handleCommit = useCallback(async () => {
		if (!account) return;
		setCommitting(true);
		try {
			const { transactions: built, newCategories } = buildImportTransactions(reconciled, {
				accountId: account.id,
				currency: account.currency,
				makeCategory,
			});
			// Validate every row against domain rules before touching the DB. New
			// categories aren't persisted yet, so validate against the UNION so a
			// row referencing a just-minted category doesn't fail MISSING_TO.
			const validationEntities = [...entities, ...newCategories];
			for (const txn of built) {
				const check = validateTransaction(txn, validationEntities, {
					allowDeletedEntities: true,
				});
				if (!check.ok) {
					Alert.alert('Import', `A transaction is invalid: ${check.message}`);
					setCommitting(false);
					return;
				}
			}
			for (const cat of newCategories) await addEntity(cat);
			await createTransactionBatch(built);
			Alert.alert('Import complete', `Added ${built.length} transaction(s).`);
			router.back();
		} catch (e) {
			console.error('Import commit failed', e);
			Alert.alert('Import', 'Something went wrong committing the import.');
		} finally {
			setCommitting(false);
		}
	}, [account, reconciled, entities, makeCategory, addEntity, createTransactionBatch, router]);

	if (!account || account.type !== 'account') {
		return (
			<SafeAreaView className="flex-1 items-center justify-center bg-paper-50">
				<Text className="font-sans text-ink-muted">Account not found.</Text>
				<Pressable onPress={() => router.back()}>
					<Text className="mt-4 text-info">Close</Text>
				</Pressable>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView testID={TestIDs.importScreen} className="flex-1 bg-paper-50" edges={['top']}>
			<View className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4">
				<Pressable onPress={() => router.back()} hitSlop={20}>
					<Text className="font-sans text-base text-ink-muted">Cancel</Text>
				</Pressable>
				<Text className="font-sans-semibold text-base text-ink">
					Import · {account.name}
				</Text>
				<View style={{ width: 48 }} />
			</View>

			{step === 'pick' ? (
				<View className="flex-1 items-center justify-center px-8">
					<Text className="mb-6 text-center font-sans text-base text-ink-muted">
						Choose a CSV statement exported from your bank. We&apos;ll detect the date
						and amount columns.
					</Text>
					<Pressable
						testID={TestIDs.importPickFileButton}
						onPress={() => void handlePick()}
						className="rounded-full bg-ink px-6 py-3"
					>
						{busy ? (
							<ActivityIndicator color="white" />
						) : (
							<Text className="font-sans-semibold text-base text-paper-50">
								Choose file
							</Text>
						)}
					</Pressable>
				</View>
			) : null}

			{step === 'map' && mapping && rawText ? (
				<StepMapColumns
					rawText={rawText}
					mapping={mapping}
					headers={headers}
					currency={account.currency}
					confident={confident}
					onChange={setMapping}
					onConfirm={enterReview}
				/>
			) : null}

			{step === 'review' ? (
				<StepReview
					rows={reconciled}
					onRowsChange={setReconciled}
					categories={activeOfType('category')}
					incomes={activeOfType('income')}
					accounts={activeOfType('account').filter((a) => a.id !== account.id)}
					currency={account.currency}
					onCommit={() => void handleCommit()}
					committing={committing}
				/>
			) : null}
		</SafeAreaView>
	);
}
