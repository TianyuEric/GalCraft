import type { Character, Expression, ReviewSeed, ReviewServices } from '../../../../studio-r0/model.js';
const expressions: Expression[] = ['neutral', 'smile', 'surprised', 'serious', 'sad', 'shy'];
const names = ['平静', '微笑', '惊喜', '认真', '难过', '害羞'];
const characters: Character[] = [['lanxi', '澜汐', 'deepseek', '把每一盏灯接到正确的位置。'], ['qibai', '绮白', 'chatgpt', '今晚要把整条街装进一场电影。'], ['feishu', '绯书', 'claude', '记录这座小城最后一个春灯之夜。']].map(([id, name, prefix, description]) => ({
  id: id!,
  name: name!,
  prefix: prefix!,
  description: description!,
  outfit: '春日常服',
  expression: 'neutral',
  autoMouth: true,
  autoBlink: true,
  parts: expressions.map((expression, i) => ({
    id: `${id}-${expression}`,
    name: names[i]!,
    axis: 'expression',
    value: expression,
    image: `/practice/figures/${prefix}-${expression}.png`,
    visible: true,
    x: 0,
    y: 0,
    source: 'GalCraft 教学作品 · 春灯'
  }))
}));
const text = ['傍晚的风沿着石板路走来。街角的花店还亮着灯，门前挂起了一串纸星星。', '最后一晚，也要让大家看见这条街最好的样子。', '我把银幕挂好了。就是……它似乎有一点歪。', '一点？从这里看，月亮都快滑进银幕里了。', '别笑啦，过来帮我拉住另一边。', '澜汐蹲在灯架旁，手里捏着最后一截电线。她抬头看了看还没有亮起的街灯。', '先别接通电源。我再检查一次。', '这句话你已经说过三次了。', '所以前三次都没有发生事故。', '绯书翻开笔记本。在“春灯放映会”下面，她又写下了一个小小的日期。', '明天这里就要开始改造了，对吗？', '嗯。花店会搬到河对岸，电影院也会重新开张。', '那今晚算是告别吗？', '也可以算一封寄给未来的信。', '把我们现在的样子，留给以后的我们。', '巷子里传来了孩子的笑声。有人推来长椅，有人抱着一袋刚出炉的面包。', '座位不够了，要不要再搬几张？', '后排站着也能看见。先把这盏灯扶好。', '绮白踮起脚，把最后一颗纸星星挂在了银幕旁。', '好了。现在这颗星星比月亮还近。', '准备好了吗？', '准备好了。', '街道安静了片刻，远处传来一声清脆的开关声。', '等一下……你听，灯亮起来了。', '一串暖黄色的光从街头延伸到街尾，像有人轻轻展开了一张旧地图。', '电源接通了。最靠近银幕的那一盏，也亮了。', '原来我们真的能把一整条街点亮。', '不只是我们。你看，大家都来了。', '绯书合上笔记本，走到银幕前。', '今晚的电影，讲的是一个关于回家的故事。', '如果你愿意，也可以把自己的故事留在这里。', '等到明年春天，我们再一起把它打开。', '绮白握住了澜汐的手。灯光落在她们的指尖，温暖而清晰。', '那么，开始吧。', '放映机转动起来。纸星星轻轻摇晃，街道上的每一张脸都亮了起来。', '今晚，让春天亮起来。'];
export type Scenario = 'balanced' | 'writing' | 'inline' | 'source' | 'page' | 'blueprint' | 'character' | 'psd' | 'production' | 'running' | 'failure' | 'long' | 'empty' | 'pinned' | 'settings';
export function createReviewSeed(scenario: Scenario = 'balanced', theme: 'light' | 'dark' = 'light'): ReviewSeed {
  const lines = text.map((text, i) => ({
    id: `l${String(i + 1).padStart(2, '0')}`,
    speakerId: [0, 5, 9, 15, 18, 22, 24, 28, 32, 34].includes(i) ? null : ['qibai', 'lanxi', 'feishu'][i % 3]!,
    text,
    events: i === 23 ? [{
      id: 'pause24',
      kind: 'pause' as const,
      offset: 5,
      value: '',
      durationMs: 600
    }, {
      id: 'expression24',
      kind: 'expression' as const,
      offset: 8,
      characterId: 'qibai',
      value: 'surprised',
      durationMs: 0
    }, {
      id: 'sound24',
      kind: 'sound' as const,
      offset: 5,
      value: '通电',
      durationMs: 0
    }] : []
  }));
  lines[23]!.speakerId = 'qibai';
  lines[25]!.speakerId = 'lanxi';
  lines[25]!.events.push({
    id: 'expression26',
    kind: 'expression',
    offset: 0,
    characterId: 'lanxi',
    value: 'smile',
    durationMs: 0
  });
  if (scenario === 'long') for (let i = 37; i < 170; i++) lines.push({
    id: `l${i}`,
    speakerId: i % 3 ? 'feishu' : null,
    text: `第 ${i} 句 · ${text[i % text.length]} ${text[(i + 7) % text.length]} 时间慢慢过去，我们依然记得那一晚每一盏灯的颜色。`,
    events: []
  });
  const seed: ReviewSeed = {
    project: {
      id: 'spring-review',
      name: '今晚，让春天亮起来',
      characters: structuredClone(characters),
      scenes: [{
        id: 'street',
        name: '街道 · 春灯的最后一晚',
        background: '/practice/backgrounds/spring-street.png',
        lines,
        cast: Object.fromEntries(characters.map((c, i) => [c.id, {
          outfit: '春日常服',
          expression: 'neutral' as const,
          x: 480 + i * 480,
          y: 1080,
          scale: .72,
          visible: true
        }]))
      }, {
        id: 'shop',
        name: '店前 · 把星星挂起来',
        background: '/practice/backgrounds/spring-street.png',
        lines: [{
          id: 's01',
          speakerId: null,
          text: '门口的纸星星轻轻晃动。绮白在玻璃上写下了今晚放映的时间。',
          events: []
        }, {
          id: 's02',
          speakerId: 'qibai',
          text: '七点半。别迟到，我们给你留了最好的座位。',
          events: []
        }],
        cast: {
          qibai: {
            outfit: '春日常服',
            expression: 'smile',
            x: 960,
            y: 1080,
            scale: .72,
            visible: true
          }
        }
      }],
      assets: characters.flatMap(c => expressions.map(expression => ({
        id: `${c.id}-${expression}`,
        name: `${c.name} · ${names[expressions.indexOf(expression)]}`,
        kind: 'image' as const,
        url: `/practice/figures/${c.prefix}-${expression}.png`,
        characterId: c.id,
        expression
      }))).concat([]),
      page: {
        id: 'start-page',
        name: '开始界面',
        background: '/practice/backgrounds/spring-street.png',
        objects: [{
          id: 'title',
          name: '作品标题',
          kind: 'text',
          text: '今晚，让春天亮起来',
          x: 120,
          y: 115,
          width: 820,
          height: 380,
          visible: true,
          fontSize: 68
        }, {
          id: 'start',
          name: '开始游戏',
          kind: 'button',
          text: '开始游戏',
          x: 145,
          y: 600,
          width: 440,
          height: 80,
          visible: true,
          fontSize: 46
        }, {
          id: 'continue',
          name: '继续游戏',
          kind: 'button',
          text: '继续游戏',
          x: 145,
          y: 708,
          width: 440,
          height: 80,
          visible: true,
          fontSize: 46
        }, {
          id: 'settings',
          name: '设置',
          kind: 'button',
          text: '设置',
          x: 145,
          y: 816,
          width: 440,
          height: 80,
          visible: true,
          fontSize: 46
        }],
        nodes: [{
          id: 'click',
          kind: 'click',
          objectId: 'start',
          label: '点击开始游戏',
          x: 30,
          y: 90
        }, {
          id: 'fade',
          kind: 'fade',
          label: '淡出开始界面',
          x: 300,
          y: 90,
          durationMs: 500
        }, {
          id: 'condition',
          kind: 'condition',
          label: '首次开始？',
          x: 570,
          y: 90
        }, {
          id: 'variable',
          kind: 'variable',
          label: 'firstStart',
          x: 310,
          y: 330,
          value: true
        }, {
          id: 'scene',
          kind: 'scene',
          label: '进入街道',
          x: 840,
          y: 90,
          sceneId: 'street'
        }, {
          id: 'shop-scene',
          kind: 'scene',
          label: '返回店前',
          x: 840,
          y: 330,
          sceneId: 'shop'
        }],
        edges: [{
          id: 'e1',
          source: 'click',
          target: 'fade',
          sourceHandle: 'out',
          targetHandle: 'in',
          kind: 'execution'
        }, {
          id: 'e2',
          source: 'fade',
          target: 'condition',
          sourceHandle: 'out',
          targetHandle: 'in',
          kind: 'execution'
        }, {
          id: 'e3',
          source: 'condition',
          target: 'scene',
          sourceHandle: 'yes',
          targetHandle: 'in',
          kind: 'execution'
        }, {
          id: 'e4',
          source: 'variable',
          target: 'condition',
          sourceHandle: 'value',
          targetHandle: 'value',
          kind: 'boolean'
        }, {
          id: 'e5',
          source: 'condition',
          target: 'shop-scene',
          sourceHandle: 'no',
          targetHandle: 'in',
          kind: 'execution'
        }]
      }
    },
    ui: {
      theme,
      task: ['page', 'blueprint'].includes(scenario) ? 'page' : ['character', 'psd'].includes(scenario) ? 'character' : ['production', 'failure', 'running'].includes(scenario) ? 'production' : scenario === 'settings' ? 'settings' : 'writing',
      sceneId: 'street',
      lineId: 'l24',
      focusDocument: 'street',
      selected: {
        kind: 'line',
        documentId: 'street',
        id: 'l24'
      },
      pins: {},
      selection: {
        lineId: 'l24',
        start: 9,
        end: 9
      },
      preview: {
        status: 'paused',
        sceneId: 'street',
        lineId: 'l24',
        offset: 9,
        temporaryCandidateId: null
      },
      sourceDrafts: {},
      sourceErrors: {},
      importDraft: {
        step: 1,
        characterId: 'qibai',
        name: '绮白_春日组合.psd',
        selectedId: 'psd-neutral',
        outfit: '春日常服',
        expression: 'neutral',
        layers: expressions.map((expression, i) => ({
          id: `psd-${expression}`,
          name: `表情 / ${names[i]}`,
          sourceVisible: i === 0,
          kept: true,
          axis: 'expression',
          value: expression,
          image: `/practice/figures/chatgpt-${expression}.png`,
          sourceX: 0,
          sourceY: 0,
          x: 0,
          y: 0,
          keepSourceOffset: true,
          effect: i === 2 ? 'glow' : 'none',
          strategy: 'bake'
        }))
      },
      production: {
        status: scenario === 'failure' ? 'failed' : 'idle',
        request: '保留绮白的发型、服装和姿态，只调整为看见街灯亮起时的惊喜表情。',
        progress: 0,
        attempt: 0,
        characterId: 'qibai',
        expression: 'surprised',
        candidates: [],
        selectedId: null,
        compareId: null,
        adoptedId: null,
        overlay: true,
        error: scenario === 'failure' ? '审核服务暂时不可用。修改描述后可重试。' : null
      },
      graphRun: {
        status: 'idle',
        currentId: null,
        trace: [],
        message: '',
        breakpointId: null
      },
      notice: '审核作品已载入',
      commandOpen: false
    }
  };
  if (scenario === 'inline') seed.ui.selected = {
    kind: 'event',
    documentId: 'street',
    lineId: 'l24',
    id: 'expression24'
  };
  if (scenario === 'pinned') {
    seed.ui.sceneId = 'street';
    seed.ui.lineId = 'l26';
    seed.ui.selected = {
      kind: 'line',
      documentId: 'street',
      id: 'l26'
    };
    seed.ui.selection = {
      lineId: 'l26',
      start: 0,
      end: 0
    };
    seed.ui.pins = {
      inspector: {
        kind: 'event',
        documentId: 'street',
        id: 'expression24',
        lineId: 'l24'
      },
      stage: {
        kind: 'line',
        documentId: 'street',
        id: 'l24'
      }
    };
  }
  if (scenario === 'empty') {
    seed.project.scenes[0]!.lines = [];
    seed.project.assets = [];
  }
  if (scenario === 'long') seed.project.scenes[0]!.name = '街道 · 春灯的最后一晚——写给未来每一个还愿意停下来看一场电影的人';
  seed.ui.importDraft.layers.unshift(...['春日常服', '衣装色差样例'].map((value, i) => ({
    id: `psd-outfit-${i}`,
    name: value,
    sourceVisible: i === 0,
    kept: true,
    axis: 'outfit' as const,
    value,
    image: '/practice/figures/chatgpt-neutral.png',
    sourceX: 0,
    sourceY: 0,
    x: 0,
    y: 0,
    keepSourceOffset: true,
    effect: 'none' as const,
    strategy: 'merge' as const
  })));
  return seed;
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('已取消', 'AbortError'));
    }, {
      once: true
    });
  });
}
export function createReviewServices({
  failSave = false,
  failFirstProduction = false
}: {
  failSave?: boolean;
  failFirstProduction?: boolean;
} = {}): ReviewServices {
  let saved = false;
  return {
    async save(_project, signal) {
      await delay(450, signal);
      if (failSave && !saved) {
        saved = true;
        throw new Error('审核保存服务暂时不可用。作品和草稿仍保留，请重试。');
      }
    },
    async produce({
      character,
      expression,
      attempt
    }, signal, progress) {
      for (const value of [12, 28, 46, 68, 84, 100]) {
        await delay(280, signal);
        progress(value);
      }
      if (failFirstProduction && attempt === 1) throw new Error('审核服务连接中断，已保留描述，可以重试。');
      return [expression, 'smile' as const, 'shy' as const].map((value, i) => ({
        id: `result-${attempt}-${i}`,
        name: `方案 ${'ABC'[i]}`,
        url: `/practice/figures/${character.prefix}-${value}.png`,
        expression: value,
        description: i ? '教学作品中的表情变体，用于比较流程' : '目标表情 · 教学作品确定性结果'
      }));
    }
  };
}
