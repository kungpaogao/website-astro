import { Component, JSXElement } from "solid-js";

const Navigation = () => {
  return (
    <nav>
      <input type="checkbox" class="peer hidden" id="menu-checkbox" />
      <div class="flex">
        <label class="p-3 md:hidden" for="menu-checkbox">
          ...
        </label>
      </div>
      <div class="linear max-h-0 overflow-hidden transition-all duration-500 peer-checked:max-h-28 md:max-h-[none]">
        <ul class="flex flex-col gap-x-3 border-b border-gray-200 p-3 md:flex-row md:border-none">
          <a href="/" class="hidden hover:animate-pulse md:block">
            高
          </a>
          <span class="flex-1" />
          <NavigationItem href="/" className="md:hidden">
            Home
          </NavigationItem>
          <NavigationItem href="/projects">Projects</NavigationItem>
          <NavigationItem href="/about">About</NavigationItem>
        </ul>
      </div>
    </nav>
  );
};

type NavigationItemProps = {
  href: string;
  children: JSXElement;
  className?: string;
};

const NavigationItem: Component<NavigationItemProps> = (props) => (
  <li
    class={`text-gray-500 transition-colors hover:text-black ${props.className}`}
  >
    <a href={props.href}>{props.children}</a>
  </li>
);

export default Navigation;
