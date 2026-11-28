'use client';

import {ArrowLeft, MapPin, Play, Image as ImageIcon, User} from 'lucide-react';
import {str, type Business, type Editorial, type Media, type Settings} from '../lib/model';
import {categoryIcon} from './Icons';

function mediaSynthetic(url: string, name: string, alt?: string, business_id = 'site-assets'): Media {
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(url);
  return { business_id, filename: '', url, source_url: '', license: '', attribution: '', permission_status: 'approved', cover: true, alt: alt || name, kind: isVideo ? 'video' : 'image', thumbnail: isVideo ? url + (url.includes('?') ? '&' : '?') + 'thumb=1' : undefined };
}

function galleryUrls(guide: Editorial): string[] {
  return (guide.gallery || '').split(/[\s,]+/).filter(Boolean);
}

function authorLabel(guide: Editorial) {
  if (!guide.author) return '';
  const type = guide.authorType === 'agent' ? 'IslaVista agent' : guide.authorType === 'community' ? 'Community contributor' : 'Local editor';
  return `${guide.author} · ${type}`;
}

export default function GuideDetail({ destination, guide, data }: { destination: string; guide: Editorial; data: any }) {
  const rows: Business[] = data.businesses || [];
  const settings: Settings = data.settings;
  const places = (guide.businesses || '').split(/[\s,]+/).filter(Boolean)
    .map(id => rows.find((b: Business) => b.business_id === id)).filter(Boolean) as Business[];
  const gallery = galleryUrls(guide).map(u => mediaSynthetic(u, guide.title, guide.imageAlt));
  const cover = guide.cover ? mediaSynthetic(guide.cover, guide.title, guide.imageAlt) : undefined;
  const coverSrc = cover ? (cover.kind === 'video' ? (cover.thumbnail || cover.url) : cover.url) : '';

  return (
    <article className="guide-detail">
      <div className="guide-detail-topbar">
        <a className="textlink" href={`/${destination}/guides`}><ArrowLeft size={15} /> Back to stories</a>
        {!!guide.category && <span className="ed-tag">{guide.category}</span>}
      </div>

      <header className="guide-detail-hero">
        <figure className="guide-detail-art">
          {coverSrc ? (
            cover?.kind === 'video' ? (
              <video src={cover.url} poster={cover.thumbnail} controls playsInline preload="metadata" />
            ) : (
              <img src={coverSrc} alt={guide.imageAlt || guide.title} />
            )
          ) : (
            <div className="photo-placeholder" role="img" aria-label="No image available"><span /></div>
          )}
          {!!guide.coverCaption && <figcaption>{guide.coverCaption}</figcaption>}
        </figure>
        <div className="guide-detail-copy">
          <p className="eyebrow">{guide.category || 'Story'}{guide.featured ? ' · Featured' : ''}</p>
          <h1>{guide.title}</h1>
          {!!guide.excerpt && <p className="guide-detail-lede">{guide.excerpt}</p>}
          {!!authorLabel(guide) && (
            <p className="guide-detail-byline"><User size={14} /> {authorLabel(guide)}</p>
          )}
        </div>
      </header>

      {!!guide.body && (
        <section className="guide-detail-body">
          {guide.body.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </section>
      )}

      {gallery.length > 0 && (
        <section className="guide-detail-gallery">
          <div className="section-head"><div><h2>Photos and video</h2><p>Moments from this story.</p></div></div>
          <div className="guide-gallery-grid">
            {gallery.map((m, i) => (
              <figure key={i} className="guide-gallery-item">
                {m.kind === 'video' ? (
                  <video src={m.url} poster={m.thumbnail} controls playsInline preload="metadata" />
                ) : (
                  <img src={m.url} alt={m.alt || guide.title} loading="lazy" />
                )}
                <span className="guide-gallery-badge">{m.kind === 'video' ? 'Video' : 'Photo'}</span>
              </figure>
            ))}
          </div>
        </section>
      )}

      {places.length > 0 && (
        <section className="guide-detail-places">
          <div className="section-head"><div><h2>Places in this story</h2><p>Tap a place to see details or open it on the map.</p></div></div>
          <div className="guide-places-list">
            {places.map(place => {
              const Icon = categoryIcon(str(place.category));
              return (
                <div key={place.business_id} className="guide-place-card">
                  <div className="guide-place-icon"><Icon size={18} /></div>
                  <div className="guide-place-copy">
                    <strong>{place.name}</strong>
                    <span>{str(place.barangay) || str(place.municipality) || str(place.category)}</span>
                  </div>
                  <div className="guide-place-actions">
                    <a className="textlink" href={`/${destination}/place/${place.business_id}`}><MapPin size={14} /> Details</a>
                    <a className="textlink" href={`/${destination}/explore`}><MapPin size={14} /> Map</a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="guide-detail-footer">
        <a className="primary" href={`/${destination}/guides`}><ArrowLeft size={15} /> Back to all stories</a>
      </footer>
    </article>
  );
}
