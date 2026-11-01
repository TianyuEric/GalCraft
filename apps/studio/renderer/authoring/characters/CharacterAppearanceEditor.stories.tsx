import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FixtureCharacters } from '@galcraft/contracts/fixtures';
import { CharacterAppearanceEditor } from './CharacterAppearanceEditor.js';
import { productAssets } from '../../stories/product-fixture.js';
import '../shell.css';
function Editor({locale='zh-CN',theme='light'}:{locale?:string;theme?:string}) {const[value,setValue]=useState(structuredClone(FixtureCharacters[0]!));return <div data-theme={theme}><section className="authoring-shell" style={{display:'block',height:'auto',minHeight:'100vh',padding:16}}><CharacterAppearanceEditor character={value} assets={productAssets()} locale={locale} change={patch=>setValue(previous=>({...previous,...patch}))}/></section></div>;}
const meta={title:'Product/Studio/Authoring/Character author defaults',component:Editor,parameters:{layout:'fullscreen'}} satisfies Meta<typeof Editor>;
export default meta;type Story=StoryObj<typeof meta>;export const Chinese:Story={};export const EnglishDark:Story={args:{locale:'en',theme:'dark'}};
