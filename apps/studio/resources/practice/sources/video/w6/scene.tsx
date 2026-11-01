import {Circle, Img, Line, Node, Rect, Txt, makeScene2D} from '@motion-canvas/2d';
import {createSignal, tween} from '@motion-canvas/core';
import {asset, font} from '@galcraft/motion-canvas-assets';
import config from './timeline.json';

// All coordinates use the 1920 × 1080 authored canvas. Props remain editable nodes.
export default makeScene2D(function* (view) {
  const time = createSignal(0);
  const clamp = (n:number, a=0, b=1) => Math.max(a, Math.min(b,n));
  const smooth = (n:number) => {const x=clamp(n); return x*x*(3-2*x);};
  const local = (start:number) => Math.max(0,time()-start);
  const visibility = (start:number,end:number,fade=.3) => smooth((time()-start)/fade)*smooth((end-time())/fade);
  const family = font('font');
  view.fill('#080d1b');
  const text = (node:Node,value:string,x:number,y:number,size=42,fill='#fff1db') => {
    node.add(<Txt text={value} x={x} y={y} fontFamily={family} fontSize={size} fill={fill} shadowColor="#090d19" shadowBlur={8} />);
  };
  const stars = (node:Node,start:number,x=470,y=-100,large=true) => {
    const points:number[][]=[];
    for(let i=0;i<11;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?58:135;points.push([Math.cos(a)*r,Math.sin(a)*r]);}
    node.add(<Line points={points} closed x={x} y={y} lineWidth={3} stroke="#bba6d1" fill="#9987bf33" />);
    for(let i=0;i<10;i++){
      const a=points[i],b=points[i+1];
      node.add(<Line points={[[a[0]-7,a[1]+7],[b[0]+7,b[1]-7]]} x={x} y={y} lineWidth={4} stroke="#f7dbaa" lineDash={[8,7]} end={()=>smooth((local(start)-i*.16)/.23)} />);
    }
    node.add(<Circle x={()=>x+Math.cos(local(start)*2)*6} y={()=>y-160+Math.sin(local(start)*2)*6} size={12} fill="#fff2be" opacity={()=>visibility(start+.5,start+3.2,.5)} shadowBlur={35} shadowColor="#ffc97f"/>);
  };
  const bulbs = (node:Node,start:number,count=10,y=-310,off=false) => {
    const pts=[];
    for(let i=0;i<count;i++)pts.push([-850+i*170,y+Math.sin(i/(count-1)*Math.PI)*80]);
    node.add(<Line points={pts} stroke="#262b3e" lineWidth={5} />);
    pts.forEach(([x,py],i)=>{
      node.add(<Line points={[[x,py],[x,py+35]]} stroke="#332a2b" lineWidth={4}/>);
      node.add(<Circle x={x} y={py+47} size={24} fill={()=>off?'#493b32':local(start)>i*.22?'#ffe6a0':'#493b32'} shadowColor="#ffb55c" shadowBlur={()=>!off&&local(start)>i*.22?42:0} />);
    });
  };
  const rain = (node:Node,start:number) => {
    for(let i=0;i<62;i++)node.add(<Line points={[[0,0],[-20,65]]} x={()=>((i*107-local(start)*190)%2200)-1100} y={()=>((i*97+local(start)*680)%1350)-650} stroke="#d4e4ff" opacity={.19} lineWidth={2}/>);
  };
  const cable = (node:Node,start:number,lights=true) => {
    node.add(<Line points={[[-850,240],[-690,195],[-520,270],[-350,180],[-200,230]]} lineWidth={14} stroke="#0c111b" radius={60}/>);
    node.add(<Line points={[[-850,240],[-690,195],[-520,270],[-350,180],[-200,230]]} lineWidth={4} stroke="#ffcc7b" radius={60} end={()=>smooth(local(start)/1.8)} shadowBlur={15} shadowColor="#ffc262"/>);
    node.add(<Rect x={()=>-130+smooth(local(start)/1.1)*45} y={230} width={95} height={50} radius={9} fill="#171c28" stroke="#ad8c54" lineWidth={2}/>);
    node.add(<Rect x={-55} y={230} width={38} height={72} radius={6} fill="#544634" stroke="#c8aa72" lineWidth={2}/>);
    if(lights)bulbs(node,start+1.2,10,-330);
  };
  const reel = (node:Node,start:number,x=-610,y=30) => {
    const spin=new Node({x,y,rotation:()=>local(start)*82});node.add(spin);
    spin.add(<Circle size={255} fill="#b5956588" stroke="#dfc595" lineWidth={7}/>);
    for(let i=0;i<5;i++){const a=i*Math.PI*.4;spin.add(<Circle x={Math.cos(a)*77} y={Math.sin(a)*77} size={57} fill="#141722" stroke="#947647" lineWidth={3}/>);}
    spin.add(<Circle size={40} fill="#b99c6b" stroke="#ffe3a9" lineWidth={3}/>);
    const strip=new Node({x:-550,y:300,rotation:-8});node.add(strip);
    strip.add(<Rect width={1450} height={130} fill="#2b1f1ce8" stroke="#c8a370" lineWidth={3}/>);
    for(let i=-6;i<8;i++){
      strip.add(<Rect x={()=>i*160+(local(start)*130)%160} width={120} height={78} fill="#d7b17b33" stroke="#c8a370" lineWidth={1}/>);
      for(const yy of [-54,54])strip.add(<Rect x={()=>i*160+(local(start)*130)%160} y={yy} width={24} height={12} radius={2} fill="#efe1c8"/>);
    }
  };
  const train = (node:Node,start:number) => {
    const moving=new Node({x:()=>1800-local(start)*480,y:-35});node.add(moving);
    moving.add(<Rect width={2350} height={260} radius={20} fill="#172d41ee" stroke="#b5d5df" lineWidth={4}/>);
    moving.add(<Rect width={2350} height={15} y={70} fill="#c9b185"/>);
    for(let i=-6;i<7;i++)moving.add(<Rect x={i*170} y={-25} width={130} height={130} radius={12} fill="#eed5a599" stroke="#7a95a1" lineWidth={4}/>);
    node.add(<Line points={[[-960,170],[960,170]]} stroke="#cfbca0" lineWidth={5}/>);
    node.add(<Circle x={700} y={-300} size={145} fill="#f4ead6" stroke="#574e4e" lineWidth={9}/>);
    node.add(<Line points={[[700,-300],[700,-351]]} stroke="#282b3a" lineWidth={6}/>);
    node.add(<Line points={[[700,-300],[742,-277]]} stroke="#282b3a" lineWidth={5} rotation={()=>local(start)*3} offset={[-700,300]}/>);
  };
  const trio = (node:Node,start:number) => {
    ['deepseek','chatgpt','claude'].forEach((name,i)=>node.add(<Img src={asset(name+'Figure')} height={890} x={-495+i*490} y={()=>170+Math.sin(local(start)*1.5+i)*3} opacity={()=>smooth((local(start)-i*.25)/.7)}/>));
  };
  const lantern = (node:Node,start:number) => {
    const n=new Node({x:570,y:()=>-80+smooth(local(start)/3)*260,rotation:()=>Math.sin(local(start)*1.7)*4});node.add(n);
    n.add(<Line points={[[0,-490],[0,-130]]} stroke="#b89e76" lineWidth={3}/>);
    n.add(<Rect width={150} height={210} radius={65} fill="#f9d99aee" stroke="#ad7845" lineWidth={4} shadowBlur={70} shadowColor="#ffcc7a"/>);
    for(let i=-2;i<3;i++)n.add(<Line points={[[i*24,-95],[i*28,0],[i*24,95]]} lineWidth={2} stroke="#c99357"/>);
    n.add(<Rect y={-106} width={70} height={12} fill="#805c3b"/>);n.add(<Rect y={106} width={70} height={12} fill="#805c3b"/>);
  };
  const album = (node:Node,start:number) => {
    node.add(<Rect width={1480} height={690} radius={12} fill="#392b2a" stroke="#b69463" lineWidth={5}/>);
    node.add(<Rect width={710} height={650} x={-363} fill="#f1e0bf"/>);
    node.add(<Rect width={710} height={650} x={363} fill="#ead6af"/>);
    node.add(<Img src={asset('shop')} width={620} x={-365} y={-45} rotation={-4}/>);
    node.add(<Line points={[[0,-325],[0,325]]} stroke="#8b6d48" lineWidth={5}/>);
    text(node,'我们',360,-10,116,'#735c48');text(node,'故事还没有完',360,120,38,'#735c48');
    const page=new Node({x:0,scaleX:()=>Math.cos(smooth(local(start)/1.5)*Math.PI/2),opacity:()=>1-smooth((local(start)-1.2)/.4)});node.add(page);
    page.add(<Rect width={710} height={650} x={355} fill="#f7e8c9" stroke="#c3a579" lineWidth={2}/>);
    page.add(<Img src={asset('claudeCg')} x={355} y={-45} width={620}/>);
  };

  for(const s of config.shots){
    const start=s.start,end=s.end,n=new Node({opacity:()=>visibility(start,end)});view.add(n);
    n.add(<Img src={asset(s.image)} width={s.kind==='album'?1920:2020} x={()=>Math.sin(local(start)*.18)*22} y={0} opacity={s.kind==='album'?.22:1}/>);
    n.add(<Rect width={1920} height={1080} fill="#0b1533" opacity={s.kind==='obstacle'?.36:.1}/>);
    if(s.kind==='closure'){
      rain(n,start);const sign=new Node({x:-490,y:-55,rotation:()=>Math.sin(local(start)*1.6)*2});n.add(sign);
      sign.add(<Line points={[[-180,-300],[-180,-100],[180,-100],[180,-300]]} stroke="#cab88f" lineWidth={3}/>);
      sign.add(<Rect width={520} height={150} fill="#18202fea" stroke="#d2b98c" lineWidth={3}/>);text(sign,'最後の上映',0,-8,50);text(sign,'春夜影院',0,43,22,'#c1b9b1');
    }
    if(s.kind==='cable')cable(n,start);
    if(s.kind==='stars'){stars(n,start,540,-80);bulbs(n,start+1.5,10,-520);}
    if(s.kind==='film')reel(n,start);
    if(s.kind==='obstacle'){rain(n,start);train(n,start);}
    if(s.kind==='together'){n.add(<Rect x={480} y={-80} width={450} height={250} fill={()=>local(start)>2?'#ffe8bd66':'#12192d66'}/>);trio(n,start);bulbs(n,start+.8);}
    if(s.kind==='lantern'){lantern(n,start);n.add(<Img src={asset('deepseekFigure')} height={760} x={-470} y={210}/>);}
    if(s.kind==='departure'){train(n,start);stars(n,start,650,-260);n.add(<Img src={asset('chatgptFigure')} height={800} x={-430} y={220}/>);}
    if(s.kind==='camera'){
      const camera=new Node({x:530,y:()=>-80+smooth(local(start)/2.6)*430,rotation:()=>smooth(local(start)/2.6)*12});n.add(camera);
      camera.add(<Rect width={350} height={210} radius={20} fill="#2b2a2c" stroke="#c8b48f" lineWidth={8}/>);camera.add(<Rect width={110} height={45} x={-50} y={-115} radius={7} fill="#b6a589"/>);
      camera.add(<Circle size={150} fill="#101928" stroke="#b7a991" lineWidth={15}/>);camera.add(<Circle size={82} fill="#263949" stroke="#778185" lineWidth={8}/>);
      n.add(<Rect width={1740} height={790} stroke="#f4dfbe" lineWidth={3} opacity={()=>1-smooth(local(start)/2)}/>);
    }
    if(s.kind==='memories'){
      const strip=new Node({x:()=>-400+local(start)*110,rotation:-5});n.add(strip);
      strip.add(<Rect width={2600} height={470} fill="#261f20" stroke="#b89667" lineWidth={4}/>);
      ['shop','chatgptCg','deepseekCg','claudeCg'].forEach((p,i)=>strip.add(<Img src={asset(p)} width={560} x={-900+i*610}/>));
      for(let i=-12;i<13;i++)for(const y of [-214,214])strip.add(<Rect x={i*100} y={y} width={35} height={18} radius={2} fill="#eadbbb"/>);
    }
    if(s.kind==='album')album(n,start);
    if(s.kind==='title'){
      n.add(<Rect width={1920} height={1080} fill="#080e1e" opacity={.84}/>);
      const colors=['#81b8df','#d2b7ec','#e9b272'];
      colors.forEach((c,i)=>n.add(<Line points={[[-920,-160+i*160],[-460,-210+i*130],[0,0]]} stroke={c} lineWidth={3} radius={90} end={()=>smooth((local(start)-i*.35)/2.1)} shadowBlur={20} shadowColor={c}/>));
      text(n,config.title,0,30,70);text(n,'一场放映，三份留给明天的约定',0,132,32,'#c9bdac');
      n.add(<Circle size={()=>8+smooth(local(start)/2)*22} y={-100} fill="#ffe6a8" shadowBlur={55} shadowColor="#ffd08b"/>);
    }
    n.add(<Rect width={1920} height={145} y={470} fill="#080d1cbd"/>);
    text(n,s.subtitle,0,437,39);
    if(s.caption)text(n,s.caption,-690,-429,26,'#f5d49c');
  }
  view.add(<Rect width={1920} height={55} y={-512.5} fill="#080d18"/>);
  view.add(<Rect width={1920} height={55} y={512.5} fill="#080d18"/>);
  const fade=new Rect({width:1920,height:1080,fill:'#080d18',opacity:()=>1-smooth(time()/.6)+smooth((time()-(config.duration-.8))/.8)});view.add(fade);
  yield* tween(config.duration,p=>time(p*config.duration));
  // Retain the last authored sample before Motion Canvas's terminal generator frame.
  yield;
});
