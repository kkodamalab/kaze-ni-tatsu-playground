export const leafKinds = ['ginkgo','maple','small'];
export function leafSVG(kind = 'ginkgo') {
  const paths = {
    ginkgo:'<path d="M50 76C35 66 7 53 9 29Q12 5 31 17Q45 0 50 20Q65 0 77 17Q95 13 91 35C86 55 65 68 50 76Z" fill="#edc645"/><path d="M50 94V73M50 73L25 27M50 73l22-47" fill="none" stroke="#b4872c" stroke-width="3"/>',
    maple:'<path d="M50 5l11 27 14-14-2 23 22-2-17 20 12 9-29 9-11 11-11-11-29-9 12-9L5 39l22 2-2-23 14 14Z" fill="#df6746"/><path d="M50 95V23M50 67L24 48M50 67l25-19" fill="none" stroke="#a44330" stroke-width="3"/>',
    small:'<path d="M20 17Q75 3 82 49Q87 85 48 85Q12 68 20 17Z" fill="#a97949"/><path d="M74 94L31 30M53 64l17-22M43 50l-17 5" fill="none" stroke="#765235" stroke-width="3"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">${paths[kind] ?? paths.ginkgo}</svg>`;
}
export class LeafEffects {
  constructor(background,flights) {
    this.background=background;this.flights=flights;this.count=0;this.displayCount=0;
    for(let i=0;i<8;i++) { const leaf=document.createElement('span');leaf.className='drifting-leaf';leaf.innerHTML=`<span>${leafSVG(leafKinds[i%3])}</span>`;
      leaf.style.cssText=`left:${6+i*12}%;--size:${18+i%4*5}px;--duration:${9+i%5*1.3}s;--delay:${-i*1.7}s;--drift:${i%2?-1:1}0${i%3*2}px;--turn:${i%2?-1:1}70deg;--sway:${2+i%3*.7}s`;background.append(leaf); }
    this.resize=()=>background.style.setProperty('--fall-distance',`${background.clientHeight+80}px`);this.observer=new ResizeObserver(this.resize);this.observer.observe(background);this.resize();
  }
  reset() { this.flights.replaceChildren();this.count=this.displayCount=0; }
  active(enabled,paused=false) { this.background.hidden=!enabled;this.background.classList.toggle('leaves-paused',paused);this.flights.classList.toggle('leaves-paused',paused); }
  update(count,platform,counter) {
    if(count>this.count){const leaf=document.createElement('span');leaf.className='collected-leaf';leaf.innerHTML=leafSVG(leafKinds[(count-1)%3]);
      const origin=this.flights.getBoundingClientRect(),p=platform.getBoundingClientRect(),c=counter.getBoundingClientRect(),x=p.x+p.width*.68-origin.x,y=p.y-110-origin.y;
      leaf.style.cssText=`left:${x}px;top:${y}px;--fly-x:${c.x+c.width/2-origin.x-x}px;--fly-y:${c.y+c.height/2-origin.y-y}px`;
      leaf.addEventListener('animationend',()=>{this.displayCount=Math.max(this.displayCount,count);counter.textContent=String(this.displayCount);counter.classList.remove('leaf-counter-pop');void counter.offsetWidth;counter.classList.add('leaf-counter-pop');leaf.remove();},{once:true});this.flights.append(leaf);
    }
    this.count=count;counter.textContent=String(this.displayCount);
  }
}
export function leafPile(container,count) {
  container.replaceChildren();container.hidden=!count;
  for(let i=0;i<Math.min(30,count);i++){const leaf=document.createElement('span');leaf.innerHTML=leafSVG(leafKinds[i%3]);leaf.style.cssText=`left:${8+(i*17)%80}%;bottom:${i%4*8}px;transform:rotate(${(i*47)%160-80}deg);`;container.append(leaf);}
}
