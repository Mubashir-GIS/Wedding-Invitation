(() => {
  'use strict';

  const gsap = window.gsap;
  const scrollTrigger = window.ScrollTrigger;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const overlay = document.getElementById('inviteOverlay');
  const main = document.querySelector('main');
  const hero = document.querySelector('.hero');
  const openButton = document.getElementById('openInvite');
  let opening;
  let established = false;

  const penStrokes = {
    Kateryna: {
      box: '0 0 237 78',
      paths: [
        'M5 65Q23 63 39 34Q64-7 48 7Q37 16 22 60Q35 39 66 18M29 45Q38 69 51 62L59 55',
        'M59 55C68 37 83 39 75 50C68 67 57 65 58 56C60 48 69 43 76 46C75 62 69 71 87 55',
        'M87 55Q101 33 100 25Q84 49 87 61Q90 68 105 54M80 42L107 39',
        'M104 55Q119 53 118 45Q115 37 107 50Q99 64 113 64Q122 63 130 50',
        'M127 55Q133 46 132 40Q128 43 132 49Q136 52 144 45Q134 62 142 63Q149 63 156 52',
        'M153 55Q165 34 163 47Q154 65 164 62Q174 58 183 42Q171 71 161 76Q151 80 153 72Q161 64 185 55',
        'M183 56Q195 34 191 48L184 64Q194 45 202 44Q208 44 201 57Q195 68 211 56',
        'M211 56C216 44 227 42 228 45C228 55 216 66 212 61C205 50 223 42 229 46Q222 67 236 56'
      ]
    },
    Dalton: {
      box: '0 0 191 77',
      paths: [
        'M3 63Q20 66 31 47Q48 20 45 14Q38 17 26 49Q20 67 13 69Q11 59 23 64Q44 75 64 54Q85 33 62 17Q46 7 20 22',
        'M66 58C72 42 87 40 86 46C83 58 69 67 67 59C62 54 78 42 86 46Q79 68 95 55',
        'M94 56Q118 27 115 18Q112 8 101 34Q85 66 100 63Q106 61 115 53',
        'M113 56Q132 29 130 23Q117 39 113 57Q110 70 129 56M109 42L137 38',
        'M129 56C137 40 154 41 150 53C146 64 135 67 131 61C126 55 137 45 143 45Q144 53 156 51',
        'M154 56Q164 39 165 44L158 63Q172 43 177 43Q182 45 175 57Q172 68 189 55'
      ]
    }
  };

  if (gsap && scrollTrigger) gsap.registerPlugin(scrollTrigger);

  function renderNames(timeline) {
    for (const [index, label] of [...hero.querySelectorAll('.name-line')].entries()) {
      const name = penStrokes[label.textContent.trim()];
      if (!name) {
        timeline.fromTo(label, {clipPath: 'inset(0 100% 0 0)'}, {clipPath: 'inset(0 -10% 0 -10%)', duration: .85}, .12 + index * .35);
        continue;
      }

      const namespace = 'http://www.w3.org/2000/svg';
      const ink = document.createElementNS(namespace, 'svg');
      ink.setAttribute('viewBox', name.box);
      ink.setAttribute('aria-hidden', 'true');
      ink.classList.add('handwritten-ink');
      label.classList.add('handwritten-label');
      for (const drawing of name.paths) {
        const path = document.createElementNS(namespace, 'path');
        path.setAttribute('d', drawing);
        path.setAttribute('pathLength', '1');
        path.style.strokeDasharray = '1';
        path.style.strokeDashoffset = '1';
        ink.append(path);
      }
      label.append(ink);
      const start = .12 + index * .6;
      timeline.to(ink.children, {strokeDashoffset: 0, duration: .27, stagger: .09, ease: 'none'}, start);
    }
  }

  function splitWords(element) {
    const text = element.textContent;
    const words = document.createDocumentFragment();
    for (const token of text.split(/(\s+)/)) {
      if (!token.trim()) {
        words.append(token);
        continue;
      }
      const word = document.createElement('span');
      word.className = 'word';
      word.textContent = token;
      words.append(word);
    }
    element.replaceChildren(words);
  }

  function setupSections() {
    const sections = [...document.querySelectorAll('.reveal')].filter(section => !section.closest('[hidden]'));
    if (!gsap || !scrollTrigger || reducedMotion.matches) {
      sections.forEach(section => section.classList.add('visible'));
      return;
    }

    document.querySelectorAll('.invite-message').forEach(splitWords);
    for (const section of sections) {
      const show = () => {
        if (section.classList.contains('visible')) return;

        section.classList.add('visible');
        const words = section.querySelectorAll('.word');
        if (words.length) {
          gsap.fromTo(words, {opacity: 0, y: 8}, {
            opacity: 1,
            y: 0,
            duration: .4,
            stagger: {amount: 1.05},
            clearProps: 'transform,opacity'
          });
        }
      };
      scrollTrigger.create({trigger: section, start: 'top 90%', once: true, onEnter: show});
      section.addEventListener('focusin', show, {once: true});
    }

    gsap.to('.hero-visuals', {
      yPercent: 13,
      ease: 'none',
      scrollTrigger: {trigger: hero, start: 'top top', end: 'bottom top', scrub: true}
    });
    gsap.fromTo('#portraitPhoto', {backgroundPosition: '50% 34%'}, {
      backgroundPosition: '50% 61%',
      ease: 'none',
      scrollTrigger: {trigger: '#details', start: 'top bottom', end: 'bottom top', scrub: true}
    });
  }

  function playbackControl(button, label, canPlay, advance, delay) {
    let playing = !reducedMotion.matches;
    let timer;
    button.hidden = false;
    function updateLabel() {
      button.textContent = playing ? 'Pause' : 'Play';
      button.setAttribute('aria-label', button.textContent + ' ' + label);
    }
    updateLabel();
    function update() {
      clearTimeout(timer);
      if (playing && !document.hidden && canPlay()) timer = setTimeout(() => {
        advance();
        update();
      }, delay);
    }
    button.addEventListener('click', () => {
      playing = !playing;
      updateLabel();
      update();
    });
    document.addEventListener('visibilitychange', update);
    reducedMotion.addEventListener('change', () => {
      playing = !reducedMotion.matches;
      updateLabel();
      update();
    });
    return update;
  }

  function setupSlideshows() {
    const gallery = document.getElementById('galleryGrid');
    if (!window.IntersectionObserver || gallery.children.length < 2 || gallery.closest('[hidden]')) return;

    const slides = [...gallery.children];
    const lightbox = document.getElementById('lightbox');
    const tools = document.querySelector('.gallery-tools');
    const galleryPlay = tools.querySelector('.gallery-play');
    let galleryVisible = false;
    let heroVisible = false;
    let active = slides[galleryIndex];

    const scheduleGallery = playbackControl(galleryPlay, 'gallery slideshow', () => (
      galleryVisible && !lightbox.open && !gallery.contains(document.activeElement)
    ), () => showGallerySlide(galleryIndex + 1), 6200);

    gallery.addEventListener('gallerychange', () => {
      const next = slides[galleryIndex];
      if (next === active) return;

      if (gsap && !reducedMotion.matches) {
        gsap.killTweensOf(slides);
        gsap.set(slides, {clearProps: 'opacity,visibility'});
        gsap.set(active, {visibility: 'visible', opacity: 1});
        gsap.to(active, {opacity: 0, duration: .95, clearProps: 'opacity,visibility'});
        gsap.fromTo(next, {opacity: 0}, {opacity: 1, duration: .95, clearProps: 'opacity'});
        gsap.fromTo(next.firstElementChild, {scale: 1}, {scale: 1.075, duration: 6.2, ease: 'none', overwrite: true});
      }
      active = next;
      scheduleGallery();
    });
    gallery.addEventListener('focusin', scheduleGallery);
    gallery.addEventListener('focusout', () => queueMicrotask(scheduleGallery));
    lightbox.addEventListener('close', scheduleGallery);
    gallery.addEventListener('click', scheduleGallery);

    const photo = document.getElementById('heroPhoto');
    const frame = photo.parentElement;
    const sources = cfg.images.gallery.slice(0, 3);
    let heroIndex = 0;
    let heroSlide;
    let pending = false;
    const scheduleHero = playbackControl(document.querySelector('.hero-play'), 'hero slideshow', () => heroVisible,
      async () => {
        if (pending) return;

        const previous = heroSlide;
        const source = sources[heroIndex];
        heroIndex = (heroIndex + 1) % (sources.length + 1);
        pending = true;
        try {
          if (!source) {
            heroSlide = null;
            if (previous && gsap && !reducedMotion.matches) {
              gsap.to(previous, {opacity: 0, duration: 1.25, onComplete: () => previous.remove()});
            } else previous?.remove();
            return;
          }
          const img = new Image();
          img.alt = '';
          img.className = 'hero-slide';
          img.src = source;
          await img.decode();
          if (!heroVisible || document.hidden) return;
          frame.append(img);
          heroSlide = img;
          if (gsap && !reducedMotion.matches) {
            gsap.to(img, {opacity: 1, duration: 1.25, onComplete: () => previous?.remove()});
            gsap.fromTo(img, {scale: 1.04}, {scale: 1.11, duration: 7, ease: 'none'});
          } else {
            img.style.opacity = '1';
            previous?.remove();
          }
        } catch {
          // Keep the previously loaded photo if a replacement cannot be decoded.
        } finally {
          pending = false;
        }
      }, 7000);

    const visibility = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.target === hero) {
          heroVisible = entry.isIntersecting;
          scheduleHero();
        } else {
          galleryVisible = entry.isIntersecting;
          scheduleGallery();
        }
      }
    }, {threshold: .25});
    visibility.observe(hero);
    visibility.observe(gallery);
  }

  function finish(enter) {
    if (established) return;
    established = true;
    enter();
    setupSections();
    setupSlideshows();
  }

  function open(enter) {
    if (opening || established) return;
    if (!gsap || reducedMotion.matches) {
      finish(enter);
      return;
    }

    // Keep the single dialog control focused during the sequence. Escape can finish it at any time.
    openButton.setAttribute('aria-disabled', 'true');
    const letter = overlay.querySelector('.invitation-letter');
    const slot = overlay.querySelector('.letter-slot');
    const envelopeParts = '.envelope-back, .envelope-pocket, .envelope-flap, .wax-seal';
    opening = gsap.timeline({defaults: {ease: 'power2.inOut'}, onComplete: () => finish(enter)});
    opening
      .to('.wax-seal', {scale: .95, duration: .12}, 0)
      .to('.wax-seal', {xPercent: 74, yPercent: 66, rotation: 39, opacity: 0, duration: .65}, .12)
      .to('.envelope-address', {opacity: 0, y: 13, duration: .45}, .08)
      .to('.envelope-flap', {rotationX: 174, z: -1, duration: .88}, .27)
      .to('.envelope-stage', {yPercent: 26, duration: .93}, .97)
      .to(letter, {yPercent: -121, duration: .93}, .97)
      .add(() => {
        slot.classList.add('released');
        gsap.set(slot, {zIndex: 4, z: 9});
      }, 1.85)
      .to(envelopeParts, {y: 40, opacity: 0, duration: .58, stagger: .03}, 1.86)
      .to('.envelope-stage', {yPercent: 0, duration: .76}, 1.9)
      .to(letter, {yPercent: -45, duration: .76}, 1.9)
      .to('.letter-fold', {rotationX: -172, duration: .95}, 2.04)
      .add(() => document.getElementById('paperInterior').removeAttribute('aria-hidden'), 2.47)
      .to(letter, {scale: 1.06, duration: .9, ease: 'power1.out'}, 2.88)
      .to(overlay, {opacity: 0, duration: .85}, 3.48);

    opening.fromTo('.hero-center > :not(.hero-names), .hero-names .amp-line', {
      opacity: 0, y: 12
    }, {opacity: 1, y: 0, duration: .56, stagger: .06, clearProps: 'transform,opacity'}, 3.55);
    const names = gsap.timeline();
    renderNames(names);
    opening.add(names, 3.52);
  }

  window.invitationMotion = {
    open,
    skip(enter) {
      // Complete visual state before unlocking the page, even if the timeline is mid-flight.
      if (opening) opening.progress(1);
      else finish(enter);
    }
  };
  overlay.querySelector('.wax-seal').addEventListener('click', () => openButton.click());
})();
