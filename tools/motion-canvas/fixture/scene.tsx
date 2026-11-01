import {Img, Rect, Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, waitFor, linear} from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const photo = createRef<Img>(), title = createRef<Txt>(), bar = createRef<Rect>();
  view.add(<Img ref={photo} src="/media/image.png" width={1100} opacity={0.45} />);
  view.add(<Rect width={960} height={540} fill="#10213788" />);
  view.add(<Txt ref={title} text="春日序章 · Motion Canvas" fontFamily="GalCraftMotion" fontSize={38} fill="#fff2d9" y={-15} />);
  view.add(<Rect ref={bar} width={0} height={5} y={75} fill="#e6a5a0" />);
  yield* all(photo().scale(1.12, 15, linear), bar().width(660, 15, linear), title().y(-45, 15, linear));
});
