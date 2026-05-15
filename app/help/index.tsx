import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';

import { Text } from '@/src/components/text';
import { KB_ARTICLES, type KbArticle } from '@/src/kb/articles';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';

export default function HelpIndexScreen() {
	const router = useRouter();
	const [query, setQuery] = useState('');

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return KB_ARTICLES;
		return KB_ARTICLES.filter(
			(a) => a.title.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q)
		);
	}, [query]);

	const renderItem = ({ item }: { item: KbArticle }) => (
		<Pressable
			testID={TestIDs.help.articleRow(item.id)}
			onPress={() =>
				router.push({ pathname: '/help/[articleId]', params: { articleId: item.id } })
			}
			className="flex-row items-center justify-between border-b border-paper-300 px-5 py-4"
		>
			<View className="flex-1 pr-3">
				<Text className="font-sans-semibold text-base text-ink">{item.title}</Text>
				<Text className="mt-1 font-sans text-sm text-ink-muted">{item.summary}</Text>
			</View>
			<ChevronRight size={16} color={colors.ink.muted} />
		</Pressable>
	);

	return (
		<SafeAreaView
			testID={TestIDs.help.listScreen}
			className="flex-1 bg-paper-50"
			edges={['top']}
		>
			<View className="border-b border-paper-300 px-5 pb-4 pt-2">
				<Text className="font-sans-bold text-2xl text-ink">Help</Text>
				<View className="mt-3 flex-row items-center rounded-2xl bg-paper-200 px-3 py-2">
					<Search size={14} color={colors.ink.muted} />
					<TextInput
						testID={TestIDs.help.searchInput}
						value={query}
						onChangeText={setQuery}
						placeholder="Search help"
						placeholderTextColor={colors.ink.placeholder}
						className="ml-2 flex-1 font-sans text-base text-ink"
					/>
				</View>
			</View>
			<FlatList data={filtered} keyExtractor={(a) => a.id} renderItem={renderItem} />
		</SafeAreaView>
	);
}
