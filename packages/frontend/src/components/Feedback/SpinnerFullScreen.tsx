import { Spin } from "antd";
import FullScreen from "../Layout/FullScreen/FullScreen";

export default function SpinnerFullScreen() {
    return (
        <FullScreen>
            <Spin size="large" />
        </FullScreen>
    )
}