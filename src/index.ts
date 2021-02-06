import "web-streams-polyfill/es2018";
import { shim } from "promise.allsettled";

shim();

require("./parse");
