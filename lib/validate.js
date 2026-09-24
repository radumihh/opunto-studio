/* Validation against the schemas in /schema — the same files the form is
   built from, so the form and the server can never disagree. Errors come
   back in Romanian, pointed at the field that caused them. */
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import path from 'path';

const LABELS = {
    name: 'Nume', title: 'Nume / titlu', photos: 'Fotografii', facts: 'Date proiect',
    texts: 'Texte', category: 'Categorie', type: 'Tip lucrare', place: 'Locație', year: 'An',
    summary: 'Descriere într-o frază', story: 'Povestea proiectului', approach: 'Abordare',
    scope: 'Ce am făcut', wallSlot: 'Poziție pe perete', materials: 'Materiale', card: 'Card',
    client: 'Client', listName: 'Nume scurt în listă', text: 'Paragraf', tagline: 'Rând scurt',
    stripLine: 'Rând sub lista de proiecte', photo: 'Poza principală', secondPhoto: 'A doua poză',
    secondCaption: 'Text sub a doua poză'
};

export function createValidator(dir) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const load = f => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    ajv.addSchema(load('photo.schema.json'));
    const schemas = {
        arch: load('arch-project.schema.json'),
        concepts: load('concepts-project.schema.json'),
        category: load('arch-category.schema.json')
    };
    const check = {
        arch: ajv.compile(schemas.arch),
        concepts: ajv.compile(schemas.concepts),
        category: ajv.compile(schemas.category)
    };

    function say(e) {
        const parts = e.instancePath.split('/').filter(Boolean);
        const field = parts[0] || e.params.missingProperty || '';
        const label = LABELS[field] || field;
        const where = parts.length > 1 && /^\d+$/.test(parts[1]) ? ' (#' + (+parts[1] + 1) + ')' : '';
        switch (e.keyword) {
            case 'required':
                if (!parts.length) return { field: e.params.missingProperty, message: (LABELS[e.params.missingProperty] || e.params.missingProperty) + ': obligatoriu pentru publicare' };
                return { field, message: label + where + ': lipsește ' + e.params.missingProperty };
            case 'minItems':  return { field, message: label + ': minim ' + e.params.limit + (field === 'photos' ? ' poze' : ' rânduri') };
            case 'maxItems':  return { field, message: label + ': maxim ' + e.params.limit };
            case 'minLength': return { field, message: label + where + ': obligatoriu' };
            case 'maxLength': return { field, message: label + where + ': maxim ' + e.params.limit + ' caractere' };
            case 'pattern':   return { field, message: label + where + ': format invalid' };
            case 'type':      return { field, message: label + where + ': ' + (e.params.type === 'string' ? 'obligatoriu' : 'valoare invalidă') };
            case 'enum':      return { field, message: label + ': valoare necunoscută' };
            case 'additionalProperties': return { field: field || e.params.additionalProperty, message: 'Câmp necunoscut: ' + e.params.additionalProperty };
            default:          return { field, message: label + where + ': ' + e.message };
        }
    }

    function run(fn, value) {
        if (fn(value)) return [];
        const out = [], seen = new Set();
        for (const e of fn.errors) {
            /* the if/then and oneOf wrappers add their own summary lines */
            if (e.keyword === 'if' || e.keyword === 'oneOf') continue;
            if (/\/(image|photo|secondPhoto)$/.test(e.instancePath) && e.keyword === 'type') continue;
            const s = say(e);
            if (seen.has(s.message)) continue;
            seen.add(s.message);
            out.push(s);
        }
        return out;
    }

    return {
        schemas,
        validate: project => check[project.site] ? run(check[project.site], project) : [{ field: 'site', message: 'Site necunoscut' }],
        validateCategory: c => run(check.category, c)
    };
}
