// Generates `:root[data-theme=dark]` overrides for every color in the app CSS at build time,
// so stylesheets keep plain light-mode colors and dark mode stays in sync automatically.
const DARK=':root[data-theme=dark]';
const COLOR_PROPS=/^(color|background(-color|-image)?|border(-(top|right|bottom|left|block|inline)(-start|-end)?)?(-color)?|outline(-color)?|box-shadow|text-shadow|fill|stroke|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?|--.+)$/;
const COLOR_RE=/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(white|black)\b/gi;
const SKIP_MEDIA=/print|forced-colors/;

const clamp=(v,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));
const toLinear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
const fromLinear=c=>c<=.0031308?c*12.92:1.055*c**(1/2.4)-.055;

function parse(text){
  const s=text.toLowerCase();
  if(s==='white')return [1,1,1,1];
  if(s==='black')return [0,0,0,1];
  if(s.startsWith('#')){
    let h=s.slice(1);
    if(h.length<=4)h=[...h].map(c=>c+c).join('');
    if(h.length!==6&&h.length!==8)return null;
    const n=[0,2,4,6].map(i=>parseInt(h.slice(i,i+2)||'ff',16)/255);
    return n;
  }
  const parts=s.replace(/rgba?\(|\)/g,'').split(/[\s,/]+/).filter(Boolean);
  if(parts.length<3)return null;
  const ch=parts.slice(0,3).map(p=>p.endsWith('%')?parseFloat(p)/100:parseFloat(p)/255);
  const a=parts[3]===undefined?1:parts[3].endsWith('%')?parseFloat(parts[3])/100:parseFloat(parts[3]);
  return [...ch,a];
}

// sRGB <-> OKLCH, so lightness changes keep the perceived hue.
function toOklch([r,g,b]){
  [r,g,b]=[r,g,b].map(toLinear);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  const L=.2104542553*l+.793617785*m-.0040720468*s,A=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
  return [L,Math.hypot(A,B),Math.atan2(B,A)];
}
function fromOklchRaw(L,C,H){
  const A=C*Math.cos(H),B=C*Math.sin(H);
  const l=(L+.3963377774*A+.2158037573*B)**3,m=(L-.1055613458*A-.0638541728*B)**3,s=(L-.0894841775*A-1.291485548*B)**3;
  return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s];
}
function fromOklch(L,C,H){
  let rgb=fromOklchRaw(L,C,H);
  for(let i=0;i<20&&rgb.some(v=>v<-.0005||v>1.0005);i++){C*=.9;rgb=fromOklchRaw(L,C,H);}
  return rgb.map(v=>clamp(fromLinear(clamp(v))));
}

function remap(L,C,role){
  const accent=C>.09&&L>=.45&&L<=.88;
  if(role==='text'){
    if(L>.9)return [L,C];
    if(accent)return [Math.max(L,.72),C];
    return [L<.25?.93:.93-(L-.25)*.6,C];
  }
  if(role==='shadow')return L<.5?[L,C]:[.18,C*.5];
  if(accent)return [Math.min(L,.74),C];
  if(role==='border')return L<.42?[.6,C]:[Math.min(.6,.2+(1-L)*1.6),C*.8];
  // Surfaces: dark panels stay dark, white cards sit slightly above the page background.
  if(L<.42)return [Math.max(L,.28),C];
  return [L>=.97?.215+(L-.97):.215+(.97-L)*.9,C*.8];
}

function convert(text,role){
  const rgba=parse(text);
  if(!rgba)return text;
  const [L,C,H]=toOklch(rgba);
  const [nL,nC]=remap(L,C,role);
  const [r,g,b]=fromOklch(nL,nC,H).map(v=>Math.round(v*255));
  const a=Math.round(rgba[3]*1000)/1000;
  return a>=1?'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''):`rgba(${r},${g},${b},${a})`;
}

function roleOf(prop){
  if(/shadow/.test(prop))return 'shadow';
  if(/^(color|fill|stroke|caret-color|text-decoration|--muted)/.test(prop))return 'text';
  if(/^(border|outline|column-rule|--line)/.test(prop))return 'border';
  return 'surface';
}

function darkSelector(sel){
  sel=sel.trim();
  if(sel.startsWith(':root'))return DARK+sel.slice(5);
  if(/^html\b/.test(sel))return DARK+sel.slice(4);
  return `${DARK} ${sel}`;
}

const insideSkipped=node=>{
  for(let p=node.parent;p;p=p.parent){
    if(p.type==='atrule'&&(/keyframes$/.test(p.name)||(p.name==='media'&&SKIP_MEDIA.test(p.params))))return true;
  }
  return false;
};

export default function darkTheme(){
  return {
    postcssPlugin:'dark-theme',
    Once(root,{Rule}){
      const pending=[];
      root.walkRules(rule=>{
        if(rule.selector.includes(DARK)||insideSkipped(rule))return;
        const decls=rule.nodes.filter(n=>n.type==='decl'&&COLOR_PROPS.test(n.prop)&&!/^--demo/.test(n.prop));
        if(!decls.length)return;
        let changed=false;
        // Re-emit every color declaration (changed or not) so light-mode cascade order survives the higher specificity.
        const dark=new Rule({selectors:rule.selectors.map(darkSelector)});
        for(const d of decls){
          const value=d.value.replace(COLOR_RE,m=>convert(m,roleOf(d.prop)));
          if(value!==d.value)changed=true;
          dark.append({prop:d.prop,value,important:d.important});
        }
        if(rule.selector.trim()===':root')dark.append({prop:'color-scheme',value:'dark'});
        if(changed||decls.some(d=>!/^--/.test(d.prop)))pending.push([rule,dark]);
      });
      for(const [rule,dark] of pending)rule.after(dark);
    },
  };
}
darkTheme.postcss=true;
