import clsx from "clsx";
import type { Component, JSXElement } from "solid-js";
import { createSignal, onCleanup, onMount } from "solid-js";
import { md } from "../styles/breakpoints";
import { Icon } from "./Icon";

interface NavigationProps {
  className?: string;
  contentClassName?: string;
}

const Navigation: Component<NavigationProps> = ({
  className = "",
  contentClassName = "",
}) => {
  const [width, setWidth] = createSignal(0);
  const [checked, setChecked] = createSignal(false);

  const resetChecked = () => {
    setWidth(window.innerWidth);
    if (width() >= md) {
      setChecked(false);
    }
  };

  const resizeEvent = "resize";

  onMount(() => {
    resetChecked();
    window.addEventListener(resizeEvent, resetChecked);
  });

  onCleanup(() => window.removeEventListener(resizeEvent, resetChecked));

  return (
    <nav
      class={clsx(
        "border-b border-slate-300 border-opacity-50",
        "bg-white bg-opacity-70 backdrop-blur backdrop-saturate-150",
        className
      )}
    >
      {/* input that controls the state of the collapsing menu */}
      <input
        type="checkbox"
        checked={checked()}
        onChange={(e) => setChecked(e.currentTarget.checked)}
        class="peer hidden"
        id="nav-menu-state"
      />
      {/* container for the menu icon that acts as the clickable label for 
      the input */}
      <div id="nav-menu-container" class="relative mx-auto flex max-w-prose">
        {/* use target pseudo-class to hide and show links without JS */}
        <a
          id="nav-menu-open"
          class={clsx(
            "absolute top-0 left-0 z-10 h-12 w-16",
            checked() && "hidden"
          )}
          href="#nav-menu-state"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            setChecked(true);
          }}
        >
          <span class="absolute h-0 w-0 overflow-hidden text-clip">
            Open navigation menu
          </span>
        </a>
        <a
          id="nav-menu-close"
          class={clsx(
            "absolute top-0 left-0 z-10 h-12 w-16",
            checked() ? "block" : "hidden"
          )}
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            setChecked(false);
          }}
        >
          <span class="absolute h-0 w-0 overflow-hidden text-clip">
            Close navigation menu
          </span>
        </a>
        <label class="py-3 px-5 md:hidden" for="nav-menu-state">
          <Icon iconName="menu" className="h-6 w-6" />
        </label>
      </div>
      {/* actual navigation content */}
      <div
        class={clsx(
          "max-h-0 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          // show when checkbox is targeted or checked
          "peer-target:max-h-28 peer-checked:max-h-28",
          "md:max-h-[none]",
          contentClassName
        )}
      >
        <div
          class={clsx(
            "flex flex-col py-3",
            "border-b border-slate-300 border-opacity-25",
            "text-xl font-semibold",
            "md:flex-row md:border-none md:text-lg"
          )}
        >
          <ul class="flex flex-col gap-x-3 md:w-full md:flex-row">
            <NavigationItem href="/">
              <Icon iconName="gao" className="h-7 w-7 hover:fill-gray-500" />
            </NavigationItem>
            <li class="flex-1" aria-hidden="true" />
            <NavigationItem href="/projects">Projects</NavigationItem>
            <NavigationItem href="/about">About</NavigationItem>
          </ul>
        </div>
      </div>
    </nav>
  );
};

interface NavigationItemProps {
  href: string;
  children: JSXElement;
  className?: string;
}

const NavigationItem: Component<NavigationItemProps> = ({
  className = "",
  href,
  children,
}) => (
  <li
    class={clsx(
      "flex items-center",
      "hover:text-gray-500 hover:underline",
      className
    )}
  >
    <a href={href}>{children}</a>
  </li>
);

export default Navigation;
