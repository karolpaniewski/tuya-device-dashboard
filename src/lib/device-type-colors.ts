type DeviceType = "sensor" | "valve" | "plug";

export const DEVICE_TYPE_BADGE_CLASSES: Record<DeviceType, string> = {
	sensor: "bg-blue-600 text-blue-100",
	valve: "bg-orange-600 text-orange-100",
	plug: "bg-gray-600 text-gray-100",
};
