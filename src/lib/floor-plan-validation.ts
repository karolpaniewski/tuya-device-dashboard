const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg"] as const;

export const FLOOR_PLAN_MIME_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
};

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
