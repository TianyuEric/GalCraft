import type { Meta,StoryObj } from '@storybook/react-vite';
import { Identity } from './identity.js';
import '../authoring/shell.css';
const meta={title:'Components/Technical identity',component:Identity,args:{label:'素材 ID',value:'Art001',locale:'zh-CN'},decorators:[Story=><div id="app" className="authoring-shell" style={{padding:16}}><Story/></div>]} satisfies Meta<typeof Identity>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Labelled:Story={};
export const English:Story={args:{label:'Asset ID',locale:'en'}};
