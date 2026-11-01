/** Fit design coordinates to an available client-area envelope. */
export function fitPlayerContentSize(canvas, envelope) {
  const scale=Math.min(envelope.width/canvas.width,envelope.height/canvas.height);
  return {width:Math.max(1,Math.round(canvas.width*scale)),height:Math.max(1,Math.round(canvas.height*scale))};
}
export function initialPlayerContentSize(canvas) { return fitPlayerContentSize(canvas,{width:1280,height:720}); }
export function configurePlayerWindow(window, canvas, workArea) {
  const bounds=window.getBounds(), content=window.getContentBounds();
  const frame={width:bounds.width-content.width,height:bounds.height-content.height};
  const available={width:Math.max(1,workArea.width-frame.width),height:Math.max(1,workArea.height-frame.height)};
  const initial=fitPlayerContentSize(canvas,{width:Math.min(1280,available.width),height:Math.min(720,available.height)});
  const minimum=fitPlayerContentSize(canvas,{width:Math.min(960,available.width),height:Math.min(540,available.height)});
  window.setAspectRatio(canvas.width/canvas.height);
  window.setMinimumSize(minimum.width+frame.width,minimum.height+frame.height);
  window.setContentSize(initial.width,initial.height);
  let correcting=false;
  const correct=()=>{
    if(correcting||window.isDestroyed()||window.isMaximized()||window.isFullScreen())return;
    const [width,height]=window.getContentSize();
    if(Math.abs(width/canvas.width-height/canvas.height)*Math.min(canvas.width,canvas.height)<1)return;
    const next=fitPlayerContentSize(canvas,{width:Math.max(width,minimum.width),height:Math.max(height,minimum.height)});
    correcting=true;window.setContentSize(next.width,next.height);correcting=false;
  };
  window.on('resize',correct);window.on('resized',correct);window.on('unmaximize',correct);window.on('leave-full-screen',correct);
}
