import { useEffect } from 'react';

/**
 * Sets document.title and updates <meta> tags for the current page.
 * Restores the default title on unmount.
 */
export default function usePageMeta({ title, description, keywords } = {}) {
  useEffect(() => {
    const prev = document.title;
    if (title) document.title = title;

    const setMeta = (name, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setOg = (property, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta('description', description);
    setMeta('keywords', keywords);
    setOg('og:title', title);
    setOg('og:description', description);

    return () => {
      document.title = prev;
    };
  }, [title, description, keywords]);
}
