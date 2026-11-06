import {useState,useSyncExternalStore} from 'react';
import type {CandidatePreferences} from '../application/preferences.js';
import {CandidatePreferenceFields} from '../workfaces/CandidateSettingsView.js';
import {CandidateReviewDialog} from './controls/index.js';
export function CandidatePreferencesDialog({onClose,preferences}:{onClose():void;preferences:CandidatePreferences}) {
 const value=useSyncExternalStore(listener=>preferences.subscribe(listener),preferences.getSnapshot),[error,setError]=useState('');
 return <div className="gc-candidate authoring-shell candidate-dialog-scope" data-theme={value.theme}>
   <CandidateReviewDialog open title="个人偏好" closeLabel="关闭个人偏好" className="candidate-personal-preferences" onDismiss={onClose}>
     <CandidatePreferenceFields value={value} onChange={change=>{try{preferences.update(change);setError('');}catch(reason){setError(String(reason));}}}/>
     {error&&<p role="alert">{error}</p>}
   </CandidateReviewDialog>
 </div>;
}
