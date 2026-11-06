import { AlertCircle, BookOpen, Braces, Clapperboard, Code2, FileImage, FileText, FolderOpen, FolderTree, Image, ListChecks, ListTree, MessagesSquare, Package, PanelsTopLeft, Rocket, Search, Settings2, SlidersHorizontal, Terminal, Users, WandSparkles, Workflow, type LucideIcon } from 'lucide-react';
import type { Zone } from './zoned-layout.js';

/** Tools have a legal region; object editors and continuing tasks own the center. */
export const candidateWorkfaces: Record<string, { title:string; zone:Zone; role:'directory'|'document'|'inspector'|'preview'; icon:LucideIcon }> = {
  outline:{title:'剧情目录',zone:'left',role:'directory',icon:FolderTree},
  search:{title:'语义查找',zone:'left',role:'directory',icon:Search},
  'character-directory':{title:'角色目录',zone:'left',role:'directory',icon:Users},
  'page-directory':{title:'页面目录',zone:'left',role:'directory',icon:PanelsTopLeft},
  'asset-directory':{title:'素材目录',zone:'left',role:'directory',icon:FolderOpen},
  'page-outline':{title:'页面大纲',zone:'right',role:'inspector',icon:ListTree},
  inspector:{title:'属性',zone:'right',role:'inspector',icon:SlidersHorizontal},
  'asset-inspector':{title:'素材属性',zone:'right',role:'inspector',icon:FileImage},
  assets:{title:'素材',zone:'bottom',role:'directory',icon:Image},
  problems:{title:'问题',zone:'bottom',role:'document',icon:AlertCircle},
  output:{title:'输出',zone:'bottom',role:'document',icon:Terminal},
  stage:{title:'舞台',zone:'center',role:'preview',icon:Clapperboard},
  structure:{title:'剧情与变量',zone:'center',role:'document',icon:FolderTree},
  'scene-graph':{title:'故事场景图',zone:'center',role:'document',icon:FolderTree},
  overview:{title:'作品概览',zone:'center',role:'document',icon:BookOpen},
  production:{title:'制作',zone:'center',role:'document',icon:WandSparkles},
  'production-explorer':{title:'制作目录',zone:'left',role:'directory',icon:Workflow},
  collaboration:{title:'协作',zone:'center',role:'document',icon:MessagesSquare},
  settings:{title:'作品设置',zone:'center',role:'document',icon:Settings2},
  maintenance:{title:'作品维护',zone:'center',role:'document',icon:Settings2},
  plugins:{title:'插件',zone:'center',role:'document',icon:Package},
  publish:{title:'发布',zone:'center',role:'document',icon:Rocket},
};
export function workfaceIcon(id:string) {
  const kind=id.split(':')[0]!;
  const Icon=candidateWorkfaces[id]?.icon??({writing:BookOpen,source:Code2,commands:ListChecks,'command-stage':Clapperboard,assets:Image,character:Users,page:PanelsTopLeft,professional:SlidersHorizontal,'plugin-document':Braces}[kind]??FileText);
  return <Icon size={14} aria-hidden="true"/>;
}
