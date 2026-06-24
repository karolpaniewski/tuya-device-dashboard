import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { sites } from "~/server/db/schema";
import { getLogger } from "~/server/lib/log-context";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg"] as const;

const MIME_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
};

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "floor-plans");

export function validateFloorPlanUpload(
	file: File | null,
): { valid: true } | { valid: false; message: string } {
	if (!file) {
		return { valid: false, message: "No file provided" };
	}
	if (
		!ALLOWED_MIME_TYPES.includes(
			file.type as (typeof ALLOWED_MIME_TYPES)[number],
		)
	) {
		return { valid: false, message: "File must be a PNG or JPEG image" };
	}
	if (file.size > MAX_FILE_SIZE_BYTES) {
		return { valid: false, message: "File must be 5MB or smaller" };
	}
	return { valid: true };
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const formData = await request.formData();
	const siteId = formData.get("siteId");
	const file = formData.get("file");

	if (typeof siteId !== "string" || siteId.length === 0) {
		return NextResponse.json(
			{ message: "siteId is required" },
			{ status: 400 },
		);
	}

	const validation = validateFloorPlanUpload(
		file instanceof File ? file : null,
	);
	if (!validation.valid) {
		return NextResponse.json({ message: validation.message }, { status: 400 });
	}

	const uploadedFile = file as File;
	const extension = MIME_EXTENSIONS[uploadedFile.type];
	const filename = `${siteId}.${extension}`;
	const imagePath = `/uploads/floor-plans/${filename}`;

	try {
		await mkdir(UPLOAD_DIR, { recursive: true });
		const buffer = Buffer.from(await uploadedFile.arrayBuffer());
		await writeFile(path.join(UPLOAD_DIR, filename), buffer);

		const [updated] = await db
			.update(sites)
			.set({ floorPlanImagePath: imagePath, updatedAt: new Date() })
			.where(eq(sites.id, siteId))
			.returning({ id: sites.id });

		if (!updated) {
			return NextResponse.json({ message: "Site not found" }, { status: 404 });
		}
	} catch (err) {
		getLogger().error({ err, siteId }, "floor-plan-upload.write-failed");
		return NextResponse.json({ message: "Upload failed" }, { status: 500 });
	}

	return NextResponse.json({ floorPlanImagePath: imagePath });
}
