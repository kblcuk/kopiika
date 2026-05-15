import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { Text } from '@/src/components/text';
import { findArticle, KB_ARTICLES } from '@/src/kb/articles';
import { colors } from '@/src/theme/colors';
import { TestIDs } from '@/e2e/support/test-ids';

export default function ArticleScreen() {
	const router = useRouter();
	const { articleId } = useLocalSearchParams<{ articleId: string }>();
	const article = findArticle(articleId ?? '');

	const header = (
		<View className="flex-row items-center border-b border-paper-300 px-3 py-2">
			<Pressable onPress={() => router.back()} hitSlop={20} className="p-2">
				<ChevronLeft size={20} color={colors.ink.muted} />
			</Pressable>
			<Text className="ml-1 font-sans-semibold text-base text-ink">Help</Text>
		</View>
	);

	if (!article) {
		return (
			<SafeAreaView className="flex-1 bg-paper-50" edges={['top']}>
				{header}
				<View className="px-5 py-4">
					<Text className="font-sans text-base text-ink">Article not found.</Text>
				</View>
			</SafeAreaView>
		);
	}

	const Body = article.body;
	const related = (article.related ?? [])
		.map((id) => KB_ARTICLES.find((a) => a.id === id))
		.filter((a): a is NonNullable<typeof a> => Boolean(a));

	return (
		<SafeAreaView
			testID={TestIDs.help.articleScreen(article.id)}
			className="flex-1 bg-paper-50"
			edges={['top']}
		>
			{header}
			<ScrollView contentContainerStyle={{ paddingTop: 16 }}>
				<Body />
				{related.length > 0 && (
					<View className="border-t border-paper-300 px-5 py-5">
						<Text className="mb-2 font-sans-semibold text-xs uppercase text-ink-muted">
							Related
						</Text>
						{related.map((a) => (
							<Pressable
								key={a.id}
								onPress={() =>
									router.push({
										pathname: '/help/[articleId]',
										params: { articleId: a.id },
									})
								}
								className="py-2"
							>
								<Text className="font-sans text-base text-ink">{a.title}</Text>
							</Pressable>
						))}
					</View>
				)}
			</ScrollView>
		</SafeAreaView>
	);
}
