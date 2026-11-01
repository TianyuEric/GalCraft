import type { DebugScenario, Snapshot } from '@galcraft/contracts';
import type { StudioPlayer } from './player-preview.js';
type SessionController = StudioPlayer['session'];
type SessionInput = Parameters<SessionController['prepareSession']>[0];

/** One author's choices shared by independent preview sessions; never a player save. */
export class DebugRouteIntent {
  previewEntryId: string | undefined;
  previewEntrySceneId: string | undefined;
  private bases = new WeakMap<DebugScenario, { key: string; initialProgress: DebugScenario['initialProgress']; pluginInitial: DebugScenario['pluginInitial'] }>();
  private entries = new Map<string, { scenario: DebugScenario; source: 'automatic' | 'selected' }>();
  private restored = new WeakSet<DebugScenario>();
  clear(): void { this.entries.clear(); }
  restore(snapshot: Snapshot, scenario: DebugScenario, context = 'main'): 'automatic' | 'selected' {
    const key = JSON.stringify([snapshot.projectId, snapshot.engineVersion, scenario.pluginVersions, context, scenario.entry, scenario.initialProgress, scenario.pluginInitial]);
    this.bases.set(scenario, { key, initialProgress: structuredClone(scenario.initialProgress), pluginInitial: structuredClone(scenario.pluginInitial) });
    const saved = this.entries.get(key);
    if (saved) { for (const field of ['route', 'playerInputs', 'initialProgress', 'pluginInitial'] as const) Object.assign(scenario, { [field]: structuredClone(saved.scenario[field]) }); this.restored.add(scenario); return saved.source; }
    return 'automatic';
  }
  async prepare(session: SessionController, input: SessionInput & { source: { kind: 'entry'; scenario: DebugScenario } }, source: 'automatic' | 'selected') {
    const scenario = input.source.scenario, reused = this.restored.has(scenario); this.restored.delete(scenario);
    let result = await session.prepareSession({ ...input, routePolicy: 'unique' }), invalidated = false;
    const invalid = result.ok ? !result.value.reached && ['invalid', 'unreachable'].includes(result.value.routePreparation?.kind ?? '')
      : ['SCENARIO_VARIABLE', 'SCENARIO_PLUGIN'].includes(result.error.code);
    if (reused && invalid && (scenario.route.length || scenario.playerInputs.length || Object.keys(scenario.initialProgress).length)) {
      if (result.ok) session.disposePrepared(result.value.id);
      const base = this.bases.get(scenario); if (base) this.entries.delete(base.key);
      scenario.route = []; scenario.playerInputs = []; scenario.initialProgress = structuredClone(base?.initialProgress ?? {}); scenario.pluginInitial = structuredClone(base?.pluginInitial ?? {});
      invalidated = true; source = 'automatic'; result = await session.prepareSession({ ...input, routePolicy: 'unique' });
    }
    if (result.ok && result.value.reached) {
      scenario.route = structuredClone(result.value.state.route);
      const base = this.bases.get(scenario); if (base) this.entries.set(base.key, { scenario: structuredClone(scenario), source });
    }
    return { result, source, invalidated };
  }
}

export function routeLabel(snapshot: Snapshot, scenario: DebugScenario): string {
  return scenario.route.map(choice => {
    const instruction = snapshot.scenes.flatMap(scene => scene.instructions).find(item => item.statementId === choice.statementId);
    const options = (instruction?.args as { options?: {id:string;text:string}[] } | undefined)?.options;
    return options?.find(option => option.id === choice.optionId)?.text;
  }).filter(Boolean).join(' → ');
}
export function routeReason(kind: string | undefined, locale: string): string {
  const labels: Record<string, [string,string,string]> = {
    choice:['需要选择前文分支','Choose an earlier branch','前の分岐を選択してください'],
    input:['需要填写有效的玩家输入','Valid player input is required','有効なプレイヤー入力が必要です'],
    unknown:['当前无法证明唯一可达路线，请选择分支或调整调试初值','A unique route could not be proven; select a branch or adjust initial values','一意のルートを確認できません。分岐か初期値を選択してください'],
    unreachable:['当前初值和路线无法到达目标，请更换路线或调整初值','The route cannot reach this target; change the route or initial values','このルートでは到達できません。ルートか初期値を変更してください'],
    invalid:['先前选择已不可用，请重新选择','The previous selection is unavailable; choose again','前の選択は無効です。選び直してください'],
  };
  const values=labels[kind??'choice']??labels.choice!;return values[locale==='en'?1:locale==='ja'?2:0];
}
