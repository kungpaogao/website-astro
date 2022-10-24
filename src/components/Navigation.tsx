import {
  Component,
  createSignal,
  JSXElement,
  onCleanup,
  onMount,
} from "solid-js";
import { md } from "../styles/breakpoints";

type NavigationProps = {
  className?: string;
  contentClassName?: string;
};

const Navigation: Component<NavigationProps> = ({
  className = "",
  contentClassName = "",
}) => {
  const [width, setWidth] = createSignal(0);
  const [checked, setChecked] = createSignal(false);

  const callback = () => {
    setWidth(window.innerWidth);
    if (width() >= md) {
      setChecked(false);
    }
  };

  const event = "resize";

  onMount(() => {
    callback();
    window.addEventListener(event, callback);
  });

  onCleanup(() => window.removeEventListener(event, callback));

  return (
    <nav
      class={`border-b border-slate-300 border-opacity-25 bg-white 
      bg-opacity-70 backdrop-blur-md ${className}`}
    >
      {/* input that controls the state of the collapsing menu */}
      <input
        type="checkbox"
        checked={checked()}
        onChange={(e) => setChecked(e.currentTarget.checked)}
        class="peer hidden"
        id="menu-checkbox"
      />
      {/* container for the menu icon that acts as the clickable label for 
      the input */}
      <div class="flex">
        <label class="py-3 px-5 md:hidden" for="menu-checkbox">
          <img src="/menu.svg" alt="Menu button" />
        </label>
      </div>
      {/* actual navigation content */}
      <div
        class={`max-h-0 overflow-hidden transition-all duration-300 ease-in-out 
        peer-checked:max-h-28 md:max-h-[none] ${contentClassName}`}
      >
        <div
          class="flex flex-col border-b border-slate-300 border-opacity-25 
        py-3 text-xl font-semibold md:flex-row md:border-none md:text-lg"
        >
          <a href="/" class="hidden font-normal hover:animate-pulse md:block">
            高
          </a>
          <span class="flex-1" />
          <ul class="flex flex-col gap-x-3 md:flex-row">
            <NavigationItem href="/" className="md:hidden">
              Home
            </NavigationItem>
            <NavigationItem href="/projects">Projects</NavigationItem>
            <NavigationItem href="/about">About</NavigationItem>
          </ul>
        </div>
      </div>
    </nav>
  );
};

type NavigationItemProps = {
  href: string;
  children: JSXElement;
  className?: string;
};

const NavigationItem: Component<NavigationItemProps> = ({
  className = "",
  href,
  children,
}) => (
  <li class={`text-slate-600 transition hover:text-black ${className}`}>
    <a href={href}>{children}</a>
  </li>
);

export default Navigation;
