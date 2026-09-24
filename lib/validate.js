/* Validation against the schemas in /schema — the same files the form is
   built from, so the form and the server can never disagree. Errors come
   back in Romanian, pointed at the field that caused them. */
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import path from 'path';

export function createValidator(dir) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const load = f => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    ajv.addSchema(load('photo.schema.json'));
    const schemas = {
        arch: load('arch-project.schema.json'),
        concepts: load('concepts-project.schema.json')
    };
    const check = {
        arch: ajv.compile(schemas.arch),
        concepts: ajv.compile(schemas.concepts)
    };

    const LABELS = {
        name: 'Nume proiect', title: 'Nume proiect', photos: 'Fotografii', facts: 'Date proiect',
        texts: 'Texte', category: 'Categorie', type: 'Tip lucrare', place: 'Locație', year: 'An',
        summary: 'Descriere într-o frază', story: 'Povestea proiectului', approach: 'Abordare',
        scope: 'Ce am făcut', wallSlot: 'Poziție pe perete'
    };
    function say(e) {
        const field = (e.instancePath.split('/')[1]) || e.params.missingProperty || '';
        const label = LABELS[field] || field;
        switch (e.keyword) {
            case 'required':  return { field: e.params.missingProperty, message: (LABELS[e.params.missingProperty] || e.params.missingProperty) + ': obligatoriu pentru publicare' };
            case 'minItems':  return { field, message: label + ': minim ' + e.params.limit + (field === 'photos' ? ' poze' : ' elemente') };
            case 'maxItems':  return { field, message: label + ': maxim ' + e.params.limit };
            case 'minLength': return { field, message: label + ': obligatoriu' };
            case 'maxLength': return { field, message: label + ': maxim ' + e.params.limit + ' caractere' };
            case 'pattern':   return { field, message: label + ': format invalid' };
            case 'type':      return { field, message: label + ': obligatoriu' };
            default:          return { field, message: label + ': ' + e.message };
        }
    }

    function validate(project) {
        const fn = check[project.site];
        if (!fn) return [{ field: 'site', message: 'Site necunoscut' }];
        if (fn(project)) return [];
        /* the if/then wrapper adds its own "must match then" line — drop it */
        const out = [], seen = new Set();
        for (const e of fn.errors) {
            if (e.keyword === 'if') continue;
            const s = say(e);
            if (seen.has(s.message)) continue;
            seen.add(s.message);
            out.push(s);
        }
        return out;
    }

    return { validate, schemas };
}
