import clsx from "clsx";
import { Component, createMemo, JSXElement } from "solid-js";
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
  const resizeEvent = "resize";
  const scrollEvent = "scroll";

  const [width, setWidth] = createSignal(0);
  const [scroll, setScroll] = createSignal(0);
  const isBorderVisible = createMemo(() => scroll() > 48);
  const [checked, setChecked] = createSignal(false);

  const onResize = () => {
    setWidth(window.innerWidth);
    if (width() >= md) {
      setChecked(false);
    }
  };

  const onScroll = () => {
    setScroll(window.scrollY);
  };

  onMount(() => {
    setScroll(0);
    onResize();
    window.addEventListener(resizeEvent, onResize);
    window.addEventListener(scrollEvent, onScroll);
  });

  onCleanup(() => {
    window.removeEventListener(resizeEvent, onResize);
    window.removeEventListener(scrollEvent, onScroll);
  });

  return (
    <nav
      class={clsx(
        "border-gray-300 border-opacity-50 transition-all",
        isBorderVisible() && "border-b",
        !isBorderVisible() && "border-b-0",
        "bg-white bg-opacity-70 backdrop-blur backdrop-saturate-150",
        className
      )}
    >
      <noscript
        class={clsx(
          "absolute top-0 left-0",
          "h-full w-full",
          "border-b border-gray-300 border-opacity-50"
        )}
        aria-hidden="true"
      />
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
      <div
        id="nav-menu-container"
        class="relative mx-auto flex max-w-prose md:hidden"
      >
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
        <label class="py-3 px-5" for="nav-menu-state">
          <Icon iconName="menu" className="h-6 w-6" />
        </label>
      </div>
      {/* actual navigation content */}
      <div
        class={clsx(
          // "max-h-0",
          "transition-all duration-300 ease-in-out",
          // show when checkbox is targeted or checked
          // "peer-target:max-h-28 peer-checked:max-h-28",
          "absolute left-0 top-0 right-0 bottom-0 h-full",
          "peer-target:h-full peer-target:bg-cyan-200 peer-checked:h-full"
          // "md:max-h-[none]",
          // "mx-auto max-w-prose",
          // contentClassName
        )}
        id="nav-content"
      >
        {/* <div
          class={clsx(
            "border border-red-500",
            "absolute left-0 top-0 right-0 z-20 flex flex-col bg-white px-5 py-3",
            "text-xl font-semibold",
            "md:relative md:flex-row md:text-lg",
            "max-w-prose"
            )}
          > */}
        {/* <div
          class={clsx(
            // "border border-red-500 bg-pink-100",
            "absolute left-0 right-0 mx-auto block max-w-prose"
          )}
        > */}
        <ul
          class={clsx(
            "absolute top-12 left-0",
            "border border-blue-500",
            // "flex flex-col gap-x-3",
            "md:flex-row",
            "text-xl font-semibold",
            "py-3"
          )}
        >
          <NavigationItem href="/">
            <Icon
              iconName="gao"
              className={clsx(
                "h-7 w-7",
                // "hover:rounded-full hover:bg-cyan-300"
                "hover:fill-gray-500"
              )}
            />
          </NavigationItem>
          {/* <li class="flex-1" aria-hidden="true" /> */}
          <NavigationItem href="/projects">Projects</NavigationItem>
          <NavigationItem href="/about">About</NavigationItem>
        </ul>
        {/* </div> */}
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
