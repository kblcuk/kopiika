import type { LucideIcon } from 'lucide-react-native';
import {
	ArrowRight,
	Banknote,
	Book,
	Briefcase,
	Building,
	Calendar,
	Car,
	Cat,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Circle,
	Coffee,
	Coins,
	CreditCard,
	Dog,
	Dumbbell,
	Film,
	Gift,
	GraduationCap,
	Heart,
	Home,
	Landmark,
	Pencil,
	Percent,
	PiggyBank,
	Plane,
	Plus,
	Shield,
	Shirt,
	ShoppingCart,
	Smartphone,
	Star,
	TrendingUp,
	Trash2,
	Utensils,
	Wallet,
	X,
	Zap,
} from 'lucide-react-native';

// Icon registry mapping kebab-case names to icon components
// This approach enables tree-shaking - only icons in this registry are bundled
export const iconRegistry: Record<string, LucideIcon> = {
	// Income icons
	briefcase: Briefcase,
	building: Building,
	gift: Gift,
	percent: Percent,
	'trending-up': TrendingUp,
	wallet: Wallet,

	// Account icons
	'credit-card': CreditCard,
	banknote: Banknote,
	landmark: Landmark,
	'piggy-bank': PiggyBank,
	coins: Coins,

	// Category icons
	'shopping-cart': ShoppingCart,
	car: Car,
	coffee: Coffee,
	film: Film,
	utensils: Utensils,
	home: Home,
	heart: Heart,
	zap: Zap,
	smartphone: Smartphone,
	shirt: Shirt,
	book: Book,
	dumbbell: Dumbbell,
	cat: Cat,
	dog: Dog,

	// Saving icons
	plane: Plane,
	shield: Shield,
	'graduation-cap': GraduationCap,
	star: Star,

	// UI icons
	'chevron-left': ChevronLeft,
	'chevron-right': ChevronRight,
	'chevron-up': ChevronUp,
	'chevron-down': ChevronDown,
	plus: Plus,
	trash2: Trash2,
	'arrow-right': ArrowRight,
	calendar: Calendar,
	pencil: Pencil,
	x: X,
	circle: Circle,
};

/**
 * Get icon component by kebab-case name
 * Falls back to Circle icon if not found
 */
export function getIcon(name: string): LucideIcon {
	return iconRegistry[name.toLowerCase()] || Circle;
}

/**
 * Get icon component by kebab-case name, converting to PascalCase internally
 * This maintains compatibility with the old toIconName approach
 */
export function getIconByKebabCase(name: string): LucideIcon {
	return getIcon(name);
}
