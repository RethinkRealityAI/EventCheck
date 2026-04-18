import { describe, it, expect } from 'vitest';
import { mapAnnouncementFromDb } from '../services/announcementService';

describe('mapAnnouncementFromDb', () => {
  it('maps snake_case DB columns to camelCase Announcement', () => {
    const row = {
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', image_url: null,
      is_active: true, published_at: 't', created_at: 't', updated_at: 't',
    };
    expect(mapAnnouncementFromDb(row)).toEqual({
      id: 'a-1', site: 'gansid', title: 'Hello', body: 'World', imageUrl: null,
      isActive: true, publishedAt: 't', createdAt: 't', updatedAt: 't',
    });
  });

  it('preserves null body and image_url', () => {
    const row = {
      id: 'a-2', site: 'scago', title: 'No body', body: null, image_url: null,
      is_active: false, published_at: 't', created_at: 't', updated_at: 't',
    };
    const a = mapAnnouncementFromDb(row);
    expect(a.body).toBeNull();
    expect(a.imageUrl).toBeNull();
    expect(a.isActive).toBe(false);
  });
});
