import styles from "./Brand.module.css";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={`${styles.brand} ${className ?? ""}`}>
      DataScalr<span className={styles.dot}>.</span>
    </span>
  );
}
