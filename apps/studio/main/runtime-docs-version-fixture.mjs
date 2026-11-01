import {createId} from '@galcraft/contracts';

/** Build two scene inputs for an isolated real-host acceptance project, using its actual assets. */
export function runtimeDocsVersionScenePlan({sceneAId,sceneBId,imageAssetId,onceAssetId,voiceAssetIds=[],sfxAssetId=null}) {
  const ids=Object.fromEntries(['amountA','amountB','flag','empty','mustPass','object','backWeather','frontWeather','sound',
    'first','second','setA','call','returned','reset','resetLabel','resetLine','setAgain','jump','jumpLabel','jumpLine','choice','option','choiceLabel','choiceLine','end',
    'defaults','setB','insideB','showObject','back','front','objectWait','objectDone','cameraWait','cameraDone','onceWait','onceDone','voiceA','voiceB','soundPlay','return'].map(name=>[name,createId()]));
  const command=(name,args,id)=>`${name} ${JSON.stringify(args)} @${id};`;
  const say=(text,id,extra={})=>command('say',{speaker:{kind:'narrator'},text,...extra},id);
  const expression=source=>`expr(${JSON.stringify(source)})`;
  const declarations=[
    {op:'scene.declarations',id:sceneAId,returns:'void',locals:[{id:ids.amountA,name:'amount',type:'number',initial:1}]},
    {op:'scene.declarations',id:sceneBId,returns:'number',locals:[
      {id:ids.amountB,name:'amount',type:'number',initial:5,parameter:{required:true,defaultValue:0}},
      {id:ids.flag,name:'flag',type:'boolean',initial:true,parameter:{required:false,defaultValue:false}},
      {id:ids.empty,name:'empty',type:'string',initial:'initial',parameter:{required:true,defaultValue:''}},
      {id:ids.mustPass,name:'mustPass',type:'number',initial:0,parameter:{required:false,defaultValue:null}},
    ]},
  ];
  const a=[say('连续首句：{{"text"}} / {{1 + 2}} / \\{{literal}} / ${ordinary}',ids.first,{continue:true}),
    say('默认等待：下一步调用 B；在 B 中存读档。',ids.second),
    command('setVar',{variableId:ids.amountA,op:'assign',value:9},ids.setA),
    command('callScene',{sceneId:sceneBId,parameters:{[ids.mustPass]:7},receiver:{scope:'local',variableId:ids.amountA}},ids.call),
    say(`返回 A：amount={{local["${ids.amountA}"]}}；预期 42。`,ids.returned),
    command('changeScene',{sceneId:sceneAId,labelId:ids.resetLabel},ids.reset),
    command('label',{labelId:ids.resetLabel,name:'Same-scene reset'},createId()),
    say(`changeScene 后：{{local["${ids.amountA}"]}}；预期 1。`,ids.resetLine),
    command('setVar',{variableId:ids.amountA,op:'assign',value:9},ids.setAgain),
    command('jumpLabel',{labelId:ids.jumpLabel},ids.jump),
    command('label',{labelId:ids.jumpLabel,name:'Local-preserving jump'},createId()),
    say(`jumpLabel 后：{{local["${ids.amountA}"]}}；预期 9。`,ids.jumpLine),
    command('choose',{options:[{id:ids.option,text:'同场景选择跳转',target:{sceneId:sceneAId,labelId:ids.choiceLabel}}]},ids.choice),
    command('label',{labelId:ids.choiceLabel,name:'Local-preserving choice'},createId()),
    say(`choose 后：{{local["${ids.amountA}"]}}；预期 9。`,ids.choiceLine),command('end',{},ids.end)];
  const b=[say(`B 默认：{{local["${ids.amountB}"]}} / {{local["${ids.flag}"]}} / '{{local["${ids.empty}"]}}'；实参 {{local["${ids.mustPass}"]}}。`,ids.defaults),
    command('setVar',{variableId:ids.amountB,op:'assign',value:2},ids.setB),say(`B 局部：{{local["${ids.amountB}"]}}；预期 2，在此存读档。`,ids.insideB),
    command('changeIllustration',{op:'show',objectId:ids.object,assetId:imageAssetId,effects:{z:10}},ids.showObject),
    command('pixi',{effectId:ids.backWeather,type:'rain',layer:'back',density:8,speed:30},ids.back),
    command('pixi',{effectId:ids.frontWeather,type:'snow',layer:'front',density:8,speed:30},ids.front),
    command('setTransform',{target:{kind:'object',id:ids.object},effects:{x:80},durationMs:8000},ids.objectWait),
    say('对象动画已完成；预期恢复中途进度且只完成一次。',ids.objectDone),
    command('setTransform',{target:{kind:'stage'},effects:{x:40},durationMs:8000},ids.cameraWait),
    say('镜头动画已完成；预期恢复中途进度且只完成一次。',ids.cameraDone),
    command('changeIllustration',{op:'replace',objectId:ids.object,assetId:onceAssetId,playback:{mode:'once',wait:true}},ids.onceWait),
    say('一次动图已完成；预期恢复中途进度且只完成一次。',ids.onceDone),
    ...(sfxAssetId?[command('playEffect',{soundId:ids.sound,assetId:sfxAssetId,loop:false},ids.soundPlay)]:[]),
    say('语音 A。',ids.voiceA,voiceAssetIds[0]?{voice:voiceAssetIds[0]}:{}),
    say('语音 B。',ids.voiceB,voiceAssetIds[1]?{voice:voiceAssetIds[1]}:{}),
    `return {value:${expression(`local["${ids.amountB}"] + 40`)}} @${ids.return};`];
  return {ids,declarations,scripts:[{sceneId:sceneAId,text:a.join('\n')},{sceneId:sceneBId,text:b.join('\n')}],
    entry:{sceneId:sceneAId,labelId:null},expected:{afterReturn:42,afterChangeScene:1,afterJump:9,afterChoice:9},
    waits:[{kind:'localFrames',sceneId:sceneBId,statementId:ids.insideB},{kind:'object',sceneId:sceneBId,statementId:ids.objectWait},
      {kind:'camera',sceneId:sceneBId,statementId:ids.cameraWait},{kind:'once',sceneId:sceneBId,statementId:ids.onceWait}]};
}
