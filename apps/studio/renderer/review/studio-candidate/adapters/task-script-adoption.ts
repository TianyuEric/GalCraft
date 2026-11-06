import type { EditInput, Patch, Result, Snapshot, VersionRef } from '@galcraft/contracts';
import { candidateTextContent, reviewScriptText, previewScriptText, type ScriptReviewTextInput } from '@galcraft/authoring/production/review-text';
import type { CompileInput } from '@galcraft/dsl';
import type { CandidateSession } from '../application/session.js';
import { withCandidateCompileInput } from '../application/compile-source.js';
import { prepareMediaTaskAdoption, type AdoptionChoice } from './task-adoption.js';
import { currentVersions, hasUnappliedTaskSource, taskError, taskOk } from './task-model.js';

export const isScriptAdoption = ({candidate,output}: AdoptionChoice) => !output.media.length &&
  !candidate.artifacts.some(artifact=>artifact.kind==='animation') && ['script','performance'].includes(candidate.operation??'');

function scriptInput(current: CompileInput, selection: AdoptionChoice): Result<ScriptReviewTextInput> {
  const {candidate,item,output}=selection;
  if(item.creationMode==='discuss'||item.conversation?.mode==='discuss'||item.target.usage!=='script')
    return taskError('SCRIPT_USAGE','讨论候选用于继续制作，请先生成剧情或演出。');
  const document=current.documents.find(document=>document.sceneId===item.target.sceneId);
  if(!document)return taskError('SCRIPT_TARGET','冻结的采用场景已不存在。');
  if(!item.sourceVersions.some(version=>version.ref.kind==='document'&&version.ref.id===document.documentId&&version.revision===document.revision))
    return taskError('ADOPTION_CONFLICT','冻结的采用范围已变化，请复核范围并新建制作草稿。');
  return taskOk({candidate,current,documentId:document.documentId,beforeStatementId:item.target.statementId,
    replaceStatementIds:item.target.replaceStatementIds??[],bindings:{},expected:item.sourceVersions,
    text:candidateTextContent(candidate,candidate.editedText??output.text)});
}

export async function prepareCandidateTaskAdoption(session: CandidateSession, selections: AdoptionChoice[]): Promise<Result<EditInput>> {
  const scripts=selections.filter(isScriptAdoption);
  if(!scripts.length)return prepareMediaTaskAdoption(session.host.list(),selections);
  const documents=session.host.list(), media=selections.filter(selection=>!isScriptAdoption(selection));
  try {
    return await withCandidateCompileInput(session.services.bridge,documents,async current=>{
      const patches: Patch[]=[], expected=new Map<string,VersionRef>(), assets:string[]=[], refs:EditInput['requiredRefs']=[];
      if(media.length){
        const prepared=prepareMediaTaskAdoption(documents,media);if(!prepared.ok)return prepared;
        patches.push(...prepared.value.patches);assets.push(...prepared.value.preparedAssets);refs.push(...prepared.value.requiredRefs);
        prepared.value.expected.forEach(version=>expected.set(version.ref.id,version));
      }
      for(const selected of scripts){
        if(!currentVersions(documents,selected.item.sourceVersions))return taskError('ADOPTION_CONFLICT','冻结的采用位置版本已变化，请新建制作草稿。');
        const input=scriptInput(current,selected);if(!input.ok)return input;
        if(hasUnappliedTaskSource(session,[input.value.documentId])||session.sourceReadOnly(selected.item.target.sceneId!))
          return taskError('DOCUMENT_DRAFT','采用位置的源码尚未应用或无效，请先修复或恢复。');
        const reviewed=await reviewScriptText(input.value);if(!reviewed.ok)return reviewed;
        patches.push(...reviewed.value.patches);reviewed.value.expected.forEach(version=>expected.set(version.ref.id,version));
      }
      const text=new Map<string,Extract<Patch,{kind:'text'}>>(), other:Patch[]=[];
      for(const patch of patches){
        if(patch.kind!=='text'){other.push(patch);continue;}
        const combined=text.get(patch.documentId)??{kind:'text',documentId:patch.documentId,edits:[]};
        for(const edit of patch.edits){
          if(combined.edits.some(previous=>edit.start<previous.end&&previous.start<edit.end||edit.start===previous.start))
            return taskError('ADOPTION_OVERLAP','候选采用范围重叠。请为同一位置选择一个候选。');
          combined.edits.push(edit);
        }
        text.set(patch.documentId,combined);
      }
      return taskOk({label:'采用制作候选',origin:'candidate',expected:[...expected.values()],patches:[...other,...text.values()],preparedAssets:assets,requiredRefs:refs});
    });
  }catch(reason){return taskError('SCRIPT_REVIEW',reason instanceof Error?reason.message:String(reason));}
}

export async function previewCandidateScript(session: CandidateSession, selection: AdoptionChoice): Promise<Result<Snapshot>> {
  if(!isScriptAdoption(selection))return taskError('SCRIPT_USAGE','此候选不是剧情或演出。');
  try {
    return await withCandidateCompileInput(session.services.bridge,session.host.list(),async current=>{
      const input=scriptInput(current,selection);if(!input.ok)return input;
      if(hasUnappliedTaskSource(session,[input.value.documentId])||session.sourceReadOnly(selection.item.target.sceneId!))return taskError('DOCUMENT_DRAFT','采用位置的源码尚未应用或无效，请先修复或恢复。');
      return previewScriptText(input.value);
    });
  }catch(reason){return taskError('SCRIPT_PREVIEW',reason instanceof Error?reason.message:String(reason));}
}
