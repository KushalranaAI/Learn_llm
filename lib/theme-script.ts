// Server-safe: the inline script that applies the saved theme before first paint (so there is no flash of the wrong theme).
export const THEME_KEY = "llm100-theme";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}')||'dark';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
