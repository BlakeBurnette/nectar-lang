// runtime/modules/animate.js — Spring physics, keyframes, and stagger animation runtime

const AnimateRuntime = {
  _animations: new Map(),

  spring(readString, namePtr, nameLen, configPtr, configLen) {
    const name = readString(namePtr, nameLen);
    const config = JSON.parse(readString(configPtr, configLen));
    AnimateRuntime._animations.set(name, {
      type: 'spring',
      stiffness: config.stiffness || 120,
      damping: config.damping || 14,
      mass: config.mass || 1,
      properties: config.properties || ['opacity', 'transform'],
    });
  },

  keyframes(readString, namePtr, nameLen, configPtr, configLen) {
    const name = readString(namePtr, nameLen);
    const config = JSON.parse(readString(configPtr, configLen));
    AnimateRuntime._animations.set(name, { type: 'keyframes', ...config });
  },

  stagger(readString, selectorPtr, selectorLen, configPtr, configLen) {
    const selector = readString(selectorPtr, selectorLen);
    const config = JSON.parse(readString(configPtr, configLen));
    const animName = config.animation;
    const delay = parseInt(config.delay) || 50;
    const anim = AnimateRuntime._animations.get(animName);
    if (!anim) return;

    document.querySelectorAll(selector).forEach((el, i) => {
      setTimeout(() => {
        if (anim.type === 'spring') {
          AnimateRuntime._runSpring(el, anim);
        } else {
          el.animate(anim.frames, {
            duration: parseInt(anim.duration) || 300,
            easing: anim.easing || 'ease-out',
            fill: 'forwards',
          });
        }
      }, i * delay);
    });
  },

  _runSpring(el, config) {
    let velocity = 0;
    let position = 0;
    const target = 1;
    const { stiffness, damping, mass } = config;

    const step = () => {
      const force = -stiffness * (position - target);
      const dampingForce = -damping * velocity;
      const acceleration = (force + dampingForce) / mass;
      velocity += acceleration * (1 / 60);
      position += velocity * (1 / 60);

      config.properties.forEach(prop => {
        if (prop === 'opacity') el.style.opacity = position;
        if (prop === 'transform') el.style.transform = `scale(${position})`;
      });

      if (Math.abs(position - target) > 0.001 || Math.abs(velocity) > 0.001) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  },

  cancel(readString, namePtr, nameLen) {
    const name = readString(namePtr, nameLen);
    AnimateRuntime._animations.delete(name);
  },
};

const animateModule = {
  name: 'animate',
  runtime: AnimateRuntime,
  wasmImports: {
    animate: {
      spring: AnimateRuntime.spring,
      keyframes: AnimateRuntime.keyframes,
      stagger: AnimateRuntime.stagger,
      cancel: AnimateRuntime.cancel,
    }
  }
};

if (typeof module !== "undefined") module.exports = animateModule;
