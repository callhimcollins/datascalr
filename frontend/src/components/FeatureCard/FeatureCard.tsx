import Link from "next/link";
import { iconMap } from "@/lib/icons";
import styles from "./FeatureCard.module.css";

interface FeatureCardProps {
  title: string;
  description: string;
  icon: keyof typeof iconMap;
  href: string;
}

export function FeatureCard({ title, description, icon, href }: FeatureCardProps) {
  const Icon = iconMap[icon];
  return (
    <Link href={href} className={`glass-card ${styles.card}`}>
      <Icon className={styles.icon} />
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </Link>
  );
}
