import { describe, it, expect } from 'vitest';
import { mapAnnouncementFromDb } from '../services/announcementService';

describe('mapAnnouncementFromDb', () => {
  it('maps snake_case DB columns to camelCase Announcement', () => {
    const row = {
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', image_url: null,
      is_active: true, published_at: 't', created_at: 't', updated_at: 't',
      cta_label: null, cta_url: null, cta_mode: 'none', accent_color: null,
      style: 'card', starts_at: null, ends_at: null,
    };
    expect(mapAnnouncementFromDb(row)).toEqual({
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', imageUrl: null,
      isActive: true, publishedAt: 't', createdAt: 't', updatedAt: 't',
      ctaLabel: null, ctaUrl: null, ctaMode: 'none', accentColor: null,
      style: 'card', startsAt: null, endsAt: null,
    });
  });

  it('maps CTA + style fields', () => {
    const a = mapAnnouncementFromDb({
      id: '1', site: 'gansid', title: 't', body: null, image_url: null,
      is_active: true, published_at: '2026-01-01', created_at: '', updated_at: '',
      cta_label: 'Go', cta_url: 'https://x', cta_mode: 'iframe',
      accent_color: '#ba0028', style: 'banner', starts_at: null, ends_at: null,
    });
    expect(a.ctaMode).toBe('iframe');
    expect(a.accentColor).toBe('#ba0028');
    expect(a.style).toBe('banner');
  });

  it('preserves null body and image_url', () => {
    const row = {
      id: 'a-2', site: 'scago', title: 'No body', body: null, image_url: null,
      is_active: false, published_at: 't', created_at: 't', updated_at: 't',
      cta_label: null, cta_url: null, cta_mode: 'none', accent_color: null,
      style: 'card', starts_at: null, ends_at: null,
    };
    const a = mapAnnouncementFromDb(row);
    expect(a.body).toBeNull();
    expect(a.imageUrl).toBeNull();
    expect(a.isActive).toBe(false);
  });
});
