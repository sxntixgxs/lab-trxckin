"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function HeaderTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const router = useRouter();
  return (
    <div>
      <div className="flex md:flex-row gap-4 flex-col justify-between mt-4 bg-slate-200 p-4 rounded-md items-center ">
        <div className="text-black">
          <h1 className="text-2xl font-bold">{title}</h1>
          <h2 className="text-sm text-muted-foreground">{description}</h2>
        </div>
        <Button
          variant="outline"
          className="self-start md:self-center"
          onClick={() => router.back()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 mr-1"
            viewBox="0 0 512 512"
          >
            <path
              fill="currentColor"
              d="M48 256c0 114.87 93.13 208 208 208s208-93.13 208-208S370.87 48 256 48S48 141.13 48 256m252-74.14v148.28a16 16 0 0 1-26.23 12.29l-89.09-74.13a16 16 0 0 1 0-24.6l89.09-74.13A16 16 0 0 1 300 181.86"
            ></path>
          </svg>
          Volver
        </Button>
      </div>
    </div>
  );
}
