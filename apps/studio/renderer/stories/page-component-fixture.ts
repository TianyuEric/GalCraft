import { createId, type PageEditInput, type Snapshot } from '@galcraft/contracts';
import { createBasicComponent } from '@galcraft/templates/editor';
import { figureId, figureVariantId } from './product-fixture.js';

/** A real M08 authoring request, reused by the formal workspace story. */
export function componentSceneRequest(snapshot:Snapshot):PageEditInput {
  const root=createBasicComponent('container',{name:'基础组件工作页'}),pageId=createId();
  const {width,height}=snapshot.project.canvas,cellWidth=(width-120)/4,cellHeight=(height-120)/3;
  const kinds=['container','text','image','button','decoration','input','slider','toggle','select','tabs','list'] as const;
  for(const [index,kind] of kinds.entries()){
    const component=createBasicComponent(kind,{name:({container:'自由组合',text:'标题署名',image:'透明角色图片',button:'标题页导航',decoration:'非交互装饰',input:'页面文本输入',slider:'页面数值滑杆',toggle:'页面布尔开关',select:'三项选择器',tabs:'双页签',list:'真实角色列表'})[kind]});
    component.layout.x={unit:'px',value:40+(index%4)*(cellWidth+16)};component.layout.y={unit:'px',value:40+Math.floor(index/4)*(cellHeight+16)};
    component.layout.width={unit:'px',value:cellWidth};component.layout.height={unit:'px',value:kind==='image'?cellHeight:kind==='tabs'||kind==='list'||kind==='container'?cellHeight-24:64};
    component.normal={fontSize:24,color:'#24364b'};
    if(kind==='text')component.content.text='雨站来信 · 标题署名';
    if(kind==='image')component.normal.images={decoration:{assetId:figureId,variantId:figureVariantId,mode:'contain',positionX:.5,positionY:.5,colorMode:'original',tint:null,opacity:1,slices:null,borders:null,fillCenter:false}};
    if(kind==='button'){component.content.text='打开标题页';component.interactions=[{event:'click',actions:[{kind:'open',page:'title'}]}];component.normal.background={...snapshot.template.defaultVisual.background,color:'#2168a8',colorOpacity:1};component.normal.color='#ffffff';}
    if(kind==='decoration')component.normal.background={...snapshot.template.defaultVisual.background,color:'#e4effb',colorOpacity:1};
    if(['input','slider','toggle','select','tabs'].includes(kind))component.bindings={value:{source:'local',path:kind}};
    if(kind==='toggle')component.content.text='显示署名';
    if(kind==='select'||kind==='tabs')component.options=[{value:'one',label:'第一项'},{value:'two',label:'第二项'},...(kind==='select'?[{value:'three',label:'第三项'}]:[])];
    if(kind==='tabs')for(const option of component.options!){const child=createBasicComponent('text',{name:`${option.label}内容`});child.content={text:`${option.label}的页面内容`,tabValue:option.value};child.layout.position='flow';component.children.push(child);}
    if(kind==='list'){component.layout.mode='column';component.repeat={source:{source:'data',path:'characters'},key:'id',emptyText:'没有角色'};const item=createBasicComponent('text',{name:'角色名称样板'});item.bindings={text:{source:'item',path:'name'}};item.layout.position='flow';component.children.push(item);}
    if(kind==='container'){for(let i=0;i<3;i++){const child=createBasicComponent('text',{name:`组合子项 ${i+1}`});child.content.text=`子项 ${i+1}`;child.layout.x={unit:'px',value:i*90};child.layout.y={unit:'px',value:30};child.layout.width={unit:'px',value:84};component.children.push(child);}}
    root.children.push(component);
  }
  const introduction=createBasicComponent('text',{name:'人物介绍正文'});introduction.content.text='自建人物介绍页面';
  return{label:'建立基础组件正式场景',operations:[{kind:'page.create',key:'character-intro',title:'自建人物介绍',root:introduction},{kind:'page.create',id:pageId,key:'component-workspace',title:'基础组件',root},{kind:'page.update',pageId,localState:{input:'可以编辑',slider:50,toggle:true,select:'one',tabs:'one'},background:{...snapshot.template.defaultVisual.background,color:'#ffffff',colorOpacity:1}}]};
}
