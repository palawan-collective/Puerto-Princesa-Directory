import preview from '../data/preview-editorial.json';
import type {Editorial, Media, PageCopy, State} from './model';

/**
 * Bundled concept editorial for the presentation build.
 *
 * The files live in `public/preview-media` and are served through the normal
 * managed-media route, so Admin can still replace them. This is only applied
 * when a workspace has no editorial at all; once an editor saves, the stored
 * copy wins and `previewSeeded` keeps an intentionally empty page empty.
 */
const content = preview as {
  hero: string;
  pages: Partial<PageCopy>;
  media: Media[];
  collections: Editorial[];
  guides: Editorial[];
};

export function withPreviewEditorial(state: State): State {
  if (state.previewSeeded) return state;
  if (state.settings.collections.length || state.settings.guides.length) return state;

  const known = new Set(state.media.map(item=>`${item.business_id}/${item.filename}`));
  const extraMedia = content.media.filter(item=>!known.has(`${item.business_id}/${item.filename}`));
  const pages = {...state.settings.pages};
  for (const [key, value] of Object.entries(content.pages)) {
    if (value && !pages[key as keyof PageCopy]) pages[key as keyof PageCopy] = value;
  }

  return {
    ...state,
    previewSeeded: true,
    media: [...extraMedia, ...state.media],
    settings: {
      ...state.settings,
      pages,
      collections: content.collections.map(item=>({...item})),
      guides: content.guides.map(item=>({...item})),
      destinations: state.settings.destinations.map(destination=>
        destination.slug==='puerto-princesa'&&content.hero&&!destination.hero?{...destination,hero:content.hero}:destination,
      ),
    },
  };
}
