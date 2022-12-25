import clsx from "clsx";
import type { Component, JSX } from "solid-js";
import { Icon } from "./Icon";

interface BottomNavigationProps {
  className?: string;
}

export { BottomNavigation };

const BottomNavigation: Component<BottomNavigationProps> = (props) => {
  return (
    <div
      class={clsx(
        "flex w-full justify-evenly",
        "md:mx-auto md:mb-5 md:max-w-prose md:rounded-lg md:border md:shadow-md",
        "border-t border-gray-300 border-opacity-50",
        // "border border-red-500",
        props.className
      )}
    >
      <NavigationItem href="/" label="Home" icon={<Icon iconName="home" />} />
      <NavigationItem
        href="/projects"
        label="Projects"
        icon={<Icon iconName="project" />}
      />
      <NavigationItem
        href="/about"
        label="About"
        icon={<Icon iconName="about" />}
      />
    </div>
  );
};

interface NavigationItemProps {
  icon: JSX.Element;
  label: string;
  href: string;
  className?: string;
}

const NavigationItem: Component<NavigationItemProps> = (props) => {
  return (
    <span
      class={clsx(
        "my-1 px-3 py-2",
        "rounded-md transition-all",
        " hover:bg-gray-200 hover:bg-opacity-25 hover:backdrop-blur",
        "hover:-translate-y-2 hover:scale-125"
        // "border border-red-500"
      )}
    >
      <a
        href={props.href}
        class={clsx("flex flex-col items-center gap-1 text-xs")}
      >
        {props.icon}
        {props.label}
      </a>
    </span>
  );
};
