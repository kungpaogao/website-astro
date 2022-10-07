import {
  Component,
  createSignal,
  JSXElement,
  onCleanup,
  onMount,
} from "solid-js";
import { md } from "../styles/breakpoints";

const Navigation = () => {
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
    <nav>
      <input
        type="checkbox"
        checked={checked()}
        onChange={(e) => setChecked(e.currentTarget.checked)}
        class="peer hidden"
        id="menu-checkbox"
      />
      <div class="flex">
        <label class="p-3 md:hidden" for="menu-checkbox">
          <img src="/menu.svg" alt="Menu button" />
        </label>
      </div>
      <div class="max-h-0 overflow-hidden transition-all duration-300 ease-in-out peer-checked:max-h-28 md:max-h-[none]">
        <div class="flex flex-col border-b border-gray-200 p-3 text-xl font-semibold md:flex-row  md:border-none md:text-base">
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
  <li class={`text-gray-500 transition-colors hover:text-black ${className}`}>
    <a href={href}>{children}</a>
  </li>
);

export default Navigation;
