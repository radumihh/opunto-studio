import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export function formatBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
}

export function timeAgo(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'acum';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' zile';
    return new Date(iso).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const CATEGORIES = [
    { id: 'architecture', label: 'Architecture' },
    { id: 'interior-design', label: 'Interior Design' },
    { id: 'real-estate-marketing', label: 'Real Estate Marketing' }
];
export const categoryLabel = id => (CATEGORIES.find(c => c.id === id) || {}).label || id;

export const projectName = p => (p.site === 'arch' ? p.name : p.title) || 'Fără nume';
export const coverOf = p => {
    const photos = p.photos || [];
    if (p.site === 'arch') return photos[((p.card && p.card.photo) || 1) - 1] || photos[0];
    return photos[0];
};
