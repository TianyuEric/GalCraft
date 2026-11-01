import { expect, it } from 'vitest';
import { formHint } from './form-hints.js';
it('explains units, defaults and limits in the selected language',()=>{
 expect(formHint('zh-CN','过渡时间','number',{unit:'ms',default:300,min:0})).toContain('毫秒');
 const en=formHint('en','Transition duration','number',{unit:'ms',default:300,min:0});
 expect(en).toContain('milliseconds'); expect(en).toContain('default 300'); expect(en).not.toMatch(/[\u4e00-\u9fff]/);
 expect(formHint('ja','時間','number',{unit:'ms',default:300})).toContain('ミリ秒');
});
it('explains purpose rather than repeating the label',()=>{
 expect(formHint('zh-CN','场景名称')).toContain('改名不改变引用');
 expect(formHint('en','Workflow name')).toContain('Background generation');
 expect(formHint('ja','不透明度')).toContain('0 は透明');
});
