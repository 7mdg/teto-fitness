import { navigate } from '../../app/router';
import { pickTextFile } from '../../utils/files';

export const EXAMPLES = [
  { file: 'teto-recomp-12w.json', name: '12 Week Body Recomposition', detail: 'Gym · upper/lower · 4 days a week' },
  { file: 'full-body-3d-home.json', name: 'Full Body at Home', detail: 'Dumbbells only · 3 days a week' },
] as const;

export async function chooseFileAndPreview() {
  const picked = await pickTextFile();
  if (picked) navigate({ name: 'import', text: picked.text, source: picked.name });
}

export async function previewExample(file: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}examples/${file}`);
  navigate({ name: 'import', text: await res.text(), source: file });
}
