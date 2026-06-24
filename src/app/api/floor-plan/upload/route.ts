import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import {
	FLOOR_PLAN_MIME_EXTENSIONS,
	validateFloorPlanUpload,
} from "~/lib/floor-plan-validation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { sites } from "~/server/db/schema";
import { getLogger } from "~/server/lib/log-context";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "floor-plans");

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session) {
		return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
	}

	const formData = await request.formData();
	const siteId = formData.get("siteId");
	const file = formData.get("file");

	if (
		typeof siteId !== "string" ||
		siteId.length === 0 ||
		siteId.includes("/") ||
		siteId.includes("\\") ||
		siteId.includes("..")
	) {
		return NextResponse.json({ message: "Invalid siteId" }, { status: 400 });
	}

	const validation = validateFloorPlanUpload(
		file instanceof File ? file : null,
	);
	if (!validation.valid) {
		return NextResponse.json({ message: validation.message }, { status: 400 });
	}

	const [site] = await db
		.select({ id: sites.id })
		.from(sites)
		.where(eq(sites.id, siteId));
	if (!site) {
		return NextResponse.json({ message: "Site not found" }, { status: 404 });
	}

	const uploadedFile = file as File;
	const extension = FLOOR_PLAN_MIME_EXTENSIONS[uploadedFile.type];
	const filename = `${siteId}.${extension}`;
	const imagePath = `/uploads/floor-plans/${filename}`;

	try {
		await mkdir(UPLOAD_DIR, { recursive: true });

		// Clean up a prior upload under a different extension (e.g. replacing
		// a PNG with a JPEG) so it doesn't linger as an orphan on disk.
		const existingFiles = await readdir(UPLOAD_DIR);
		const stalePrefix = `${siteId}.`;
		await Promise.all(
			existingFiles
				.filter((f) => f.startsWith(stalePrefix) && f !== filename)
				.map((f) => unlink(path.join(UPLOAD_DIR, f))),
		);

		const buffer = Buffer.from(await uploadedFile.arrayBuffer());
		await writeFile(path.join(UPLOAD_DIR, filename), buffer);

		await db
			.update(sites)
			.set({ floorPlanImagePath: imagePath, updatedAt: new Date() })
			.where(eq(sites.id, siteId));
	} catch (err) {
		getLogger().error({ err, siteId }, "floor-plan-upload.write-failed");
		return NextResponse.json({ message: "Upload failed" }, { status: 500 });
	}

	return NextResponse.json({ floorPlanImagePath: imagePath });
}
