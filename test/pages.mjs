// Test pages served on fake origins (site-a.test, site-b.test) mapped to localhost.
// Each page counts what the *site's own* handlers saw in window.__site so tests
// can tell "incident fired" apart from "site action ran / was blocked / looped".

const head = (title, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<script>window.__site = { clicks: 0, submits: 0, log: [] };
function hit(kind, what) { window.__site[kind]++; window.__site.log.push(what); }</script>${extra}</head><body>`;

export const pages = {
  '/button': head('button') + `
    <button id="b" type="button" onclick="hit('clicks','login')">Login</button>`,

  '/form': head('form') + `
    <form id="f" action="/never" onsubmit="event.preventDefault(); hit('submits','order')">
      <input name="q" value="x">
      <button id="b">Place order</button>
    </form>`,

  '/link': head('link') + `<a id="a" href="#done" onclick="hit('clicks','checkout')">Checkout</a>`,

  '/variants': head('variants') + `
    <button id="v1" type="button" onclick="hit('clicks','v1')">
        Place
        order
    </button>
    <button id="v2" type="button" onclick="hit('clicks','v2')">Place&nbsp;order</button>
    <button id="v3" type="button" onclick="hit('clicks','v3')"><span><svg width="20" height="20"><path id="v3path" d="M0 0h20v20H0z"/></svg></span> Checkout</button>
    <form onsubmit="event.preventDefault(); hit('submits','v4')"><input id="v4" type="submit" value="Place order"></form>
    <div id="v5" role="button" tabindex="0" onclick="hit('clicks','v5')">Login</div>
    <div id="v6" onclick="hit('clicks','v6')" style="cursor:pointer">Login</div>
    <button id="v7" type="button" onclick="hit('clicks','v7')">Checkout <span>(3)</span></button>`,

  '/negatives': head('negatives') + `
    <nav aria-label="Login options"><a id="n1" href="#home">Home</a></nav>
    <input id="n2" type="text" value="login">
    <p id="n3">This long paragraph explains how to login to your account, where to find the checkout and what to do if you cannot place order today.</p>
    <form onsubmit="event.preventDefault(); hit('submits', event.submitter.id)">
      <button id="n4" name="c">Cancel</button>
      <button id="n4ok" name="p">Place order</button>
    </form>`,

  '/shadow': head('shadow') + `
    <x-login id="host"></x-login>
    <script>
      customElements.define('x-login', class extends HTMLElement {
        connectedCallback() {
          const r = this.attachShadow({ mode: 'open' });
          r.innerHTML = '<button id="sb" type="button">Login</button>';
          r.querySelector('button').addEventListener('click', () => hit('clicks', 'shadow'));
        }
      });
    </script>`,

  '/frames': head('frames') + `
    <iframe id="same" src="/button" width="300" height="80"></iframe>
    <iframe id="cross" src="http://site-b.test/button" width="300" height="80"></iframe>`,

  '/stopper': head('stopper', `<script>
      // A site that swallows every click at window capture (some analytics / SPA routers do)
      window.addEventListener('click', e => { e.stopImmediatePropagation(); }, true);
    </script>`) + `<button id="b" type="button" onclick="hit('clicks','login')">Login</button>`,

  '/late': head('late') + `<div id="root"></div>
    <script>setTimeout(() => {
      const b = document.createElement('button'); b.id = 'b'; b.type = 'button'; b.textContent = 'Login';
      b.onclick = () => hit('clicks', 'late'); document.getElementById('root').appendChild(b);
    }, 400);</script>`,

  '/tt': { headers: { 'Content-Security-Policy': "require-trusted-types-for 'script'; trusted-types 'none'" },
           body: '<!doctype html><html><head><title>tt</title></head><body><button id="b" type="button">Login</button></body></html>' },

  '/frame500': head('frame500') + `<h1 id="orig">Original top page</h1><iframe id="cross" src="http://site-b.test/button" width="300" height="80"></iframe>`,

  '/busy': head('busy') + `<p>busy main thread</p>
    <script>setInterval(() => { const end = Date.now() + 400; while (Date.now() < end) {} }, 450);</script>`,

  '/stale': head('stale') + `<p>page with a panel left behind by v1.10</p>
    <div id="incident-injector-panel" class="incident-injector-panel" style="display:none">
      <div class="panel-header"><div class="panel-title">Incident Injector</div></div>
      <select id="scenario-select"></select>
    </div>`,

  '/blank': head('blank') + `<p>panel host page</p><button id="b" type="button">Login</button>`,
};
