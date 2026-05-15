import { Pressable } from 'react-native';
import { Info } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { colors } from '@/src/theme/colors';
import type { KbArticleId } from '@/src/kb/articles-meta';
import { TestIDs } from '@/e2e/support/test-ids';

interface InfoPinProps {
	articleId: KbArticleId;
	size?: number;
}

export function InfoPin({ articleId, size = 14 }: InfoPinProps) {
	const router = useRouter();
	return (
		<Pressable
			testID={TestIDs.infoPin(articleId)}
			onPress={() => router.push({ pathname: '/help/[articleId]', params: { articleId } })}
			hitSlop={12}
			className="px-1"
		>
			<Info size={size} color={colors.ink.muted} />
		</Pressable>
	);
}
