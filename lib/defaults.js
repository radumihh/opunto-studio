/* What a fresh studio starts with: the three #arch rooms as y-final has
   them, and the texture library the y-final project page used for its
   material palette (CC0, Poly Haven). */

export const CATEGORY_IDS = ['interior-design', 'architecture', 'real-estate-marketing'];

export function defaultCategories() {
    return {
        'interior-design': {
            id: 'interior-design', name: 'Interior Design', order: 0,
            title: 'Interior\nDesign',
            text: 'Apartments, offices, and the rooms inside houses that were finished by somebody else. Joinery drawn at 1:5, one material asked to do the work of three, and a joiner we can telephone.',
            tagline: 'Six interiors, four cities',
            stripLine: 'Six interiors, drawn at 1:5 and made by a joiner we can telephone.',
            photo: null, secondPhoto: null, secondCaption: ''
        },
        architecture: {
            id: 'architecture', name: 'Architecture', order: 1,
            title: 'Architecture',
            text: 'Houses, extensions and the odd building that refuses to be either. We take the plot, the light and the budget as the three fixed facts and let every other decision follow from those.',
            tagline: 'Eleven built, 2016 to now',
            stripLine: 'Eleven built since 2016, and the ground each of them stands on.',
            photo: null, secondPhoto: null, secondCaption: ''
        },
        'real-estate-marketing': {
            id: 'real-estate-marketing', name: 'Real Estate Marketing', order: 2,
            title: 'Real Estate\nMarketing',
            text: 'A development sells on an image of a building nobody can walk into yet. We draw that image out of the same model the thing will be built from, so what a buyer is promised and what gets poured are the same thing.',
            tagline: 'Renders, films, launch material',
            stripLine: 'What a building looks like a year before anyone can walk into it.',
            photo: null, secondPhoto: null, secondCaption: ''
        }
    };
}

const PH = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
export const TEXTURE_PRESETS = [
    ['Granite', 'granite_tile_04'],
    ['Marble', 'marble_01'],
    ['Black oak veneer', 'black_oak_veneer'],
    ['Brushed concrete', 'brushed_concrete']
].map(([name, slug]) => ({
    name,
    image: { id: 'ph-' + slug, src: PH + slug + '/' + slug + '_diff_1k.jpg', width: 1024, height: 1024, preset: true }
}));
