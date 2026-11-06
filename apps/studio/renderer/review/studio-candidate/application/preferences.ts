import { DefaultStudioPreferences, StudioPreferencesSchema, type StudioPreferences } from '@galcraft/contracts';
import type { AuthoringServices } from '../../../authoring/controller.js';

/** One personal preference owner per complete root; project sessions only consume it. */
export class CandidatePreferences {
  private value: StudioPreferences | null = null;
  private listeners = new Set<(value: StudioPreferences) => void>();
  private defaults:StudioPreferences;
  constructor(private key?: string, theme:StudioPreferences['theme']='light') {
    this.defaults={...structuredClone(DefaultStudioPreferences),theme,editor:{...DefaultStudioPreferences.editor,fontFamily:'Geist Variable, Microsoft YaHei UI, sans-serif'}};
    if (key && typeof localStorage !== 'undefined') {
      try { const stored = localStorage.getItem(key); if (stored) this.value = StudioPreferencesSchema.parse(JSON.parse(stored)); } catch { /* Preserve malformed legacy data; the provider remains available. */ }
    }
  }
  subscribe(listener: (value: StudioPreferences) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  getSnapshot=()=>this.value??this.defaults;
  update(change:(value:StudioPreferences)=>void) {const next=structuredClone(this.getSnapshot());change(next);this.publish(StudioPreferencesSchema.parse(next));}
  private publish(value:StudioPreferences) {
    if(this.key&&typeof localStorage!=='undefined')localStorage.setItem(this.key,JSON.stringify(value));
    this.value=structuredClone(value);
    for(const listener of this.listeners)listener(structuredClone(this.value));
  }
  bind(services: AuthoringServices): AuthoringServices {
    const readPreferences: AuthoringServices['readPreferences'] = async () => {
      if (!this.value) { const result = await services.readPreferences(); if (!result.ok) return result; this.value ??= structuredClone(result.value); }
      return {ok:true, value:structuredClone(this.value), warnings:[]};
    };
    const writePreferences: AuthoringServices['writePreferences'] = async value => {
      const parsed = StudioPreferencesSchema.parse(value), result = await services.writePreferences(parsed);
      if (!result.ok) return result;
      this.publish(parsed);
      return result;
    };
    return {...services, readPreferences, writePreferences, bridge:{...services.bridge,
      authoringPreferences:{...services.bridge.authoringPreferences, readPreferences, writePreferences}}};
  }
}
