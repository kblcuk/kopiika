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
	BottleWine,
	BriefcaseConveyorBelt,
	Bus,
	RefreshCw,
	Sofa,
	Users,
	TentTree,
	SoapDispenserDroplet,
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

	// Category and savings icons
	'bottle-wine': BottleWine,
	'briefcase-conveyor-belt': BriefcaseConveyorBelt,
	'graduation-cap': GraduationCap,
	'shopping-cart': ShoppingCart,
	'soap-dispenser-droplet': SoapDispenserDroplet,
	'tent-tree': TentTree,
	book: Book,
	bus: Bus,
	car: Car,
	cat: Cat,
	coffee: Coffee,
	dog: Dog,
	dumbbell: Dumbbell,
	film: Film,
	heart: Heart,
	home: Home,
	plane: Plane,
	shield: Shield,
	shirt: Shirt,
	smartphone: Smartphone,
	sofa: Sofa,
	star: Star,
	users: Users,
	utensils: Utensils,
	zap: Zap,

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
	'refresh-cw': RefreshCw,
};

/**
 * Get icon component by kebab-case name
 * Falls back to Circle icon if not found
 */
export function getIcon(name: string): LucideIcon {
	return iconRegistry[name.toLowerCase()] || Circle;
}
