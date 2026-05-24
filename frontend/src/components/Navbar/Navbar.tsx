import Link from "next/link";
import { Brand } from "@/components/Brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./Navbar.module.css";

export function Navbar() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <Brand />
      </Link>
      <ThemeToggle />
    </header>
  );
}
