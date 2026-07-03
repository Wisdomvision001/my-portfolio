// Animated coordinate grid in hero — geolocation motif
const canvas = document.getElementById('grid-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let w, h, dots = [];

function resize(){
  if(!canvas) return;
  w = canvas.width = canvas.offsetWidth;
  h = canvas.height = canvas.offsetHeight;
  dots = [];
  const spacing = 56;
  for(let x = 0; x < w + spacing; x += spacing){
    for(let y = 0; y < h + spacing; y += spacing){
      dots.push({x, y, baseX:x, baseY:y, phase:Math.random()*Math.PI*2});
    }
  }
}

function draw(t){
  if(!ctx) return;
  ctx.clearRect(0,0,w,h);
  const cycleMs = 4200;
  const waveWidth = 260;
  const diag = Math.sqrt(w*w + h*h);
  const period = diag/Math.SQRT2 + waveWidth;
  const pxPerMs = period / cycleMs;

  dots.forEach(d=>{
    const float = Math.sin(t/1800 + d.phase) * 2;
    const px = d.baseX;
    const py = d.baseY + float;
    const proj = (d.baseX + d.baseY) / Math.SQRT2;
    const wavePos = ((t * pxPerMs) % period) - waveWidth;
    const distFromWave = Math.abs(proj - wavePos);
    const shimmer = Math.max(0, 1 - distFromWave / waveWidth);
    const eased = shimmer * shimmer;
    const size = 1.3 + eased * 2.4;
    const alpha = 0.16 + eased * 0.75;

    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI*2);
    ctx.fillStyle = eased > 0.1 ? `rgba(242,169,78,${alpha})` : `rgba(138,147,166,${alpha*0.55})`;
    ctx.fill();
  });
  requestAnimationFrame(draw);
}

if(canvas){
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);
}

function runTypedHeadline(){
  const headline = document.querySelector('.hero-headline[data-typed-text]');
  if(!headline) return;
  const text = headline.dataset.typedText.trim();
  headline.textContent = '';
  let index = 0;
  function type(){
    headline.textContent = text.slice(0, index + 1);
    headline.classList.add('typing');
    index += 1;
    if(index < text.length){
      setTimeout(type, 35 + Math.random() * 30);
    }
  }
  type();
}

function updateActiveNav(){
  const navLinks = document.querySelectorAll('nav a[href^="#"]');
  const sections = document.querySelectorAll('section[id]');
  if(!navLinks.length || !sections.length) return;

  const sectionObserver = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        navLinks.forEach(link=>{
          const anchor = link.getAttribute('href');
          link.classList.toggle('active', anchor === `#${entry.target.id}`);
        });
      }
    });
  }, {threshold:0.45});

  sections.forEach(section=> sectionObserver.observe(section));
}

function createRevealObserver(){
  const revealEls = document.querySelectorAll('[data-reveal]');
  const observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const container = entry.target;
        const children = Array.from(container.children);
        children.forEach((child, index)=>{
          child.style.transitionDelay = `${index * 80}ms`;
        });
        container.classList.add('in');
        observer.unobserve(container);
      }
    });
  }, {threshold:0.15});
  revealEls.forEach(el=>observer.observe(el));
}

function init(){
  runTypedHeadline();
  updateActiveNav();
  createRevealObserver();
}

document.addEventListener('DOMContentLoaded', init);
