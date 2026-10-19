import { db, categoriesTable, type Category } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import type { CategoryInput, CategoryUpdate } from "@workspace/api-zod";

export const numberValue = (value: string | number | null | undefined): number => {
  const n = Number(value ?? 0);
  return isNaN(n) ? 0 : n;
};

export function getDefaultSweetImage(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("كعك") || n.includes("كحك") || n.includes("kahk")) {
    return "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("غريبة") || n.includes("غريبه") || n.includes("ghorayeba")) {
    return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("بيتي فور") || n.includes("بتيفور") || n.includes("petit four")) {
    return "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("بسكوت") || n.includes("بسكويت") || n.includes("نشادر") || n.includes("biscuit")) {
    return "https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("معمول") || n.includes("تمر") || n.includes("maamoul")) {
    return "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80";
  }
  if (n.includes("سابليه") || n.includes("سابلي") || n.includes("sable")) {
    return "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=800&q=80";
  }
  return "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80";
}

export const toCategory = (
  row: typeof categoriesTable.$inferSelect,
  reservation?: { regular: number; halfKilo: number },
) => {
  const stockQuantity = numberValue(row.stockQuantity);
  const halfKiloStock = numberValue(row.halfKiloStock);
  const reservedStock = reservation?.regular ?? 0;
  const reservedHalfKiloStock = reservation?.halfKilo ?? 0;
  const availableStock = Math.max(0, Number((stockQuantity - reservedStock).toFixed(2)));
  const availableHalfKiloStock = Math.max(0, Number((halfKiloStock - reservedHalfKiloStock).toFixed(2)));

  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    pricePerUnit: numberValue(row.pricePerUnit),
    stockQuantity,
    lowStockThreshold: numberValue(row.lowStockThreshold),
    halfKiloPrice:
      row.halfKiloPrice !== null && row.halfKiloPrice !== undefined ? numberValue(row.halfKiloPrice) : null,
    halfKiloStock,
    halfKiloThreshold: numberValue(row.halfKiloThreshold),
    availableStock,
    availableHalfKiloStock,
    reservedStock,
    reservedHalfKiloStock,
    imageUrl: row.imageUrl || getDefaultSweetImage(row.name),
    isActive: row.isActive,
  };
};

export interface FallbackCategory {
  id: number;
  name: string;
  unit: "kilo" | "half_kilo" | "box" | "piece";
  pricePerUnit: number;
  stockQuantity: number;
  lowStockThreshold: number;
  halfKiloPrice: number | null;
  halfKiloStock: number;
  halfKiloThreshold: number;
  availableStock?: number;
  availableHalfKiloStock?: number;
  reservedStock?: number;
  reservedHalfKiloStock?: number;
  imageUrl: string | null;
  isActive: boolean;
}

export const fallbackCategories: FallbackCategory[] = [
  {
    id: 1,
    name: "كعك سادة فاخر",
    unit: "kilo",
    pricePerUnit: 240,
    stockQuantity: 32,
    lowStockThreshold: 8,
    halfKiloPrice: 125,
    halfKiloStock: 25,
    halfKiloThreshold: 6,
    imageUrl: "https://images.unsplash.com/photo-1599785209707-a456fc1337bb?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 2,
    name: "غريبة فاخرة بالسمن البلدي",
    unit: "kilo",
    pricePerUnit: 280,
    stockQuantity: 18,
    lowStockThreshold: 6,
    halfKiloPrice: 145,
    halfKiloStock: 15,
    halfKiloThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 3,
    name: "بيتي فور مشكل فاخر",
    unit: "box",
    pricePerUnit: 220,
    stockQuantity: 24,
    lowStockThreshold: 5,
    halfKiloPrice: null,
    halfKiloStock: 0,
    halfKiloThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 4,
    name: "بسكوت نشادر مقرمش",
    unit: "kilo",
    pricePerUnit: 170,
    stockQuantity: 15,
    lowStockThreshold: 4,
    halfKiloPrice: 90,
    halfKiloStock: 20,
    halfKiloThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1548365328-8c6db3220e4c?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 5,
    name: "معمول بالتمر والمكسرات",
    unit: "kilo",
    pricePerUnit: 260,
    stockQuantity: 20,
    lowStockThreshold: 5,
    halfKiloPrice: 135,
    halfKiloStock: 16,
    halfKiloThreshold: 4,
    imageUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
  {
    id: 6,
    name: "سابليه شوكولاتة ومربى",
    unit: "box",
    pricePerUnit: 250,
    stockQuantity: 22,
    lowStockThreshold: 5,
    halfKiloPrice: null,
    halfKiloStock: 0,
    halfKiloThreshold: 5,
    imageUrl: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=800&q=80",
    isActive: true,
  },
];

let categoriesSeeded = false;
export async function ensureSeedCategories() {
  if (categoriesSeeded || !process.env.DATABASE_URL) return;
  try {
    const existing = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .limit(1);

    if (existing.length === 0) {
      await db.insert(categoriesTable).values(
        fallbackCategories.map((c) => ({
          name: c.name,
          unit: c.unit,
          pricePerUnit: String(c.pricePerUnit),
          stockQuantity: String(c.stockQuantity),
          lowStockThreshold: String(c.lowStockThreshold),
          halfKiloPrice: c.halfKiloPrice !== null ? String(c.halfKiloPrice) : null,
          halfKiloStock: String(c.halfKiloStock),
          halfKiloThreshold: String(c.halfKiloThreshold),
          imageUrl: c.imageUrl,
          isActive: c.isActive,
        })),
      );
    }
    categoriesSeeded = true;
  } catch (err) {
    console.error("Database seed categories error:", err);
  }
}
