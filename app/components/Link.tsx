type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;

export default function Link(props: LinkProps) {
  return (
    <a
      {...props}
      className="text-neutral-500 dark:text-neutral-500 hover:underline font-medium"
    />
  );
}
