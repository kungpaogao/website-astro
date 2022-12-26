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
    history.replaceState(
      "",
      "",
      window.location.pathname + window.location.search
    );
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
        { "border-b": isBorderVisible() && !checked() },
        { "border-b-0": !isBorderVisible() || checked() },
        "bg-white bg-opacity-70 backdrop-blur backdrop-saturate-150",
        className
      )}
    >
      <noscript
        class={clsx(
          "absolute top-0 left-0",
          "h-full w-full",
          "border-b border-gray-300 border-opacity-50",
          "peer-target:border-b-0 peer-checked:border-b-0"
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
        class={clsx(
          "relative mx-auto flex max-w-prose md:hidden",
          "peer-target:bg-white peer-checked:bg-white"
        )}
      >
        {/* use target pseudo-class to hide and show links without JS */}
        <a
          class={clsx(
            "absolute top-0 left-0 z-10 h-12 w-16",
            checked() && "hidden",
            "nav-menu-open"
          )}
          href="#nav-menu-state"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            setChecked(!checked());
          }}
        >
          <span class="absolute h-0 w-0 overflow-hidden text-clip">
            Open navigation menu
          </span>
        </a>
        <a
          class={clsx(
            "absolute top-0 left-0 z-10 h-12 w-16",
            checked() ? "block" : "hidden",
            "nav-menu-close"
          )}
          href="#"
          role="button"
          onClick={(e) => {
            e.preventDefault();
            setChecked(!checked());
          }}
        >
          <span class="absolute h-0 w-0 overflow-hidden text-clip">
            Close navigation menu
          </span>
        </a>
        <label class="py-3 px-5" for="nav-menu-state">
          <Icon
            iconName="menu"
            className={clsx("h-6 w-6", checked() && "hidden", "nav-menu-open")}
          />
          <Icon
            iconName="close"
            className={clsx(
              "h-6 w-6",
              checked() ? "block" : "hidden",
              "nav-menu-close"
            )}
          />
        </label>
      </div>
      {/* actual navigation content */}
      <ul
        id="nav-list"
        class={clsx(
          "flex-col gap-x-3 gap-y-2 pt-3 pb-5 md:pb-3",
          "md:mx-auto md:flex md:w-full md:max-w-prose md:flex-row",
          "hidden",
          "peer-target:flex peer-target:border-b",
          "peer-checked:flex peer-checked:border-b",
          "absolute right-0 left-0 md:static",
          "bg-white",
          "border-gray-300 border-opacity-50",
          contentClassName
        )}
      >
        <NavigationItem href="/">
          <Icon iconName="gao" className="h-7 w-7 hover:fill-gray-500" />
        </NavigationItem>
        <li class="hidden flex-1 md:block" aria-hidden="true" />
        <NavigationItem href="/projects">Projects</NavigationItem>
        <NavigationItem href="/about">About</NavigationItem>
      </ul>
    </nav>
  );
};

interface NavigationItemProps {
  href: string;
  children: JSXElement;
  className?: string;
}

const NavigationItem: Component<NavigationItemProps> = ({
  className,
  href,
  children,
}) => (
  <li
    class={clsx(
      "flex items-center px-5",
      "text-xl font-semibold md:text-lg",
      "mx-auto w-full max-w-[650px]",
      "md:w-auto md:max-w-none md:px-0",
      "hover:text-gray-500 hover:underline",
      className
    )}
  >
    <a href={href}>{children}</a>
  </li>
);

export default Navigation;
